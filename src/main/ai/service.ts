/**
 * Owns the chat request lifecycle for both providers.
 *
 * Conversation persistence lives here rather than in the renderer so that a
 * retry cannot duplicate a user message, an interrupted stream is still stored
 * with its real status, and every reply records the provider and model that
 * actually produced it.
 *
 * Every online dispatch is stamped with the consent generation and the vault
 * generation that were current when it started. Both are re-checked immediately
 * before the request goes out and again before anything is written back, so a
 * reply that arrives after the user locked the vault, disabled online AI, or
 * restored a backup is discarded instead of committed.
 */

import { BrowserWindow, webContents } from 'electron'
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3-multiple-ciphers'
import type {
  AiErrorCode,
  AiEvent,
  AiProvider,
  AttachmentScope,
  PayloadPreview,
  SendChatParams,
  SendChatResult,
  StoredChatMessage
} from '@shared/ai'
import { isAiProvider } from '@shared/ai'
import {
  appendMessage,
  createConversation,
  getConversation,
  getConversationMessages,
  markOnlineConsent,
  setConversationAttachments,
  setConversationProvider
} from '../db/conversations'
import { chatStream, type ChatMessageIn } from '../ollama/client'
import { approxTokens, buildSystemPrompt, MAX_PROMPT_CHARS } from './context'
import { readOpenRouterKey } from './credentials'
import { loadOnlineSettings } from './settings'
import { getCachedCatalog } from './catalog'
import { OpenRouterError, streamChatCompletion, type ChatMessageOut } from './openrouterClient'

/** State the service needs from the IPC layer, without importing it back. */
export interface AiHost {
  db(): Database.Database | null
  /** Bumped on every unlock, lock and restore. */
  vaultGeneration(): number
}

let host: AiHost | null = null

export function configureAiService(next: AiHost): void {
  host = next
}

interface ActiveRequest {
  controller: AbortController
  conversationId: string
  webContentsId: number
  provider: AiProvider
  modelId: string
  consentGeneration: number
  vaultGeneration: number
  partial: string
}

const active = new Map<string, ActiveRequest>()

function emit(req: ActiveRequest, evt: AiEvent): void {
  const wc = webContents.fromId(req.webContentsId)
  if (wc && !wc.isDestroyed()) {
    wc.send('ai:event', evt)
    return
  }
  // The requesting window is gone; fall back to any live window so a running
  // stream is not silently swallowed.
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('ai:event', evt)
  }
}

export function cancelRequest(requestId: string): void {
  active.get(requestId)?.controller.abort()
}

/** Aborts everything in flight. Used on lock, quit, disable and key removal. */
export function cancelAllRequests(): void {
  for (const req of active.values()) req.controller.abort()
  active.clear()
}

export function cancelRequestsForConversation(conversationId: string): void {
  for (const [id, req] of active) {
    if (req.conversationId === conversationId) req.controller.abort()
    void id
  }
}

function fail(code: AiErrorCode, message: string): SendChatResult {
  return { ok: false, code, message }
}

function sanitizeAttachments(value: unknown): AttachmentScope {
  if (value == null || typeof value !== 'object') return { decisionIds: [] }
  const ids = (value as AttachmentScope).decisionIds
  if (!Array.isArray(ids)) return { decisionIds: [] }
  const seen = new Set<string>()
  for (const id of ids) {
    if (typeof id === 'string' && id.length > 0 && id.length <= 64) seen.add(id)
  }
  return { decisionIds: [...seen] }
}

interface ResolvedRequest {
  db: Database.Database
  provider: AiProvider
  modelId: string
  attachments: AttachmentScope
  systemPrompt: string
  attachedTitles: string[]
  history: StoredChatMessage[]
  totalChars: number
}

/**
 * Shared validation for both `preview` and `send`, so the preview the user
 * approves is built from exactly the same inputs as the request that follows.
 */
async function resolve(
  params: {
    conversationId: string | null
    provider: unknown
    modelId: unknown
    attachments: unknown
    pendingText: string
  },
  requireOnlineReady: boolean
): Promise<{ ok: true; value: ResolvedRequest } | { ok: false; result: SendChatResult }> {
  const db = host?.db() ?? null
  if (!db) return { ok: false, result: fail('locked', 'Your journal is locked.') }

  if (!isAiProvider(params.provider)) {
    return { ok: false, result: fail('internal', 'Unknown provider.') }
  }
  const provider = params.provider
  if (typeof params.modelId !== 'string' || !params.modelId.trim()) {
    return { ok: false, result: fail('internal', 'No model selected.') }
  }
  const modelId = params.modelId.trim()
  const attachments = sanitizeAttachments(params.attachments)

  if (provider === 'openrouter' && requireOnlineReady) {
    const settings = await loadOnlineSettings()
    if (!settings.enabled) {
      return { ok: false, result: fail('not-enabled', 'Online AI is turned off.') }
    }
    const key = await readOpenRouterKey()
    if (!key) {
      return { ok: false, result: fail('no-key', 'No OpenRouter API key is saved.') }
    }
  }

  const built = buildSystemPrompt({ db, provider, attachedDecisionIds: attachments.decisionIds })
  const history = params.conversationId
    ? getConversationMessages(db, params.conversationId)
    : []

  const totalChars =
    built.systemPrompt.length +
    history.reduce((n, m) => n + m.content.length, 0) +
    params.pendingText.length

  return {
    ok: true,
    value: {
      db,
      provider,
      modelId,
      attachments,
      systemPrompt: built.systemPrompt,
      attachedTitles: built.attachedTitles,
      history,
      totalChars
    }
  }
}

// ---------------- Payload preview ----------------

export async function buildPayloadPreview(params: {
  conversationId: string | null
  provider: unknown
  modelId: unknown
  attachments: unknown
  pendingText: string
}): Promise<{ ok: true; preview: PayloadPreview } | { ok: false; result: SendChatResult }> {
  const resolved = await resolve(params, false)
  if (!resolved.ok) return resolved
  const r = resolved.value

  const messages = [
    ...r.history.map((m) => ({ role: m.role as string, content: m.content })),
    ...(params.pendingText ? [{ role: 'user', content: params.pendingText }] : [])
  ]

  const catalogModel =
    r.provider === 'openrouter'
      ? (await getCachedCatalog()).models.find((m) => m.id === r.modelId)
      : undefined

  const tokens = approxTokens(r.totalChars)
  const estimatedPromptCostUsd =
    catalogModel?.promptUsdPerMillion != null
      ? (tokens / 1_000_000) * catalogModel.promptUsdPerMillion
      : null

  return {
    ok: true,
    preview: {
      provider: r.provider,
      modelId: r.modelId,
      systemPrompt: r.systemPrompt,
      messages,
      attachedDecisionTitles: r.attachedTitles,
      totalChars: r.totalChars,
      approxTokens: tokens,
      contextLimit: catalogModel?.contextLength ?? null,
      withinBudget: r.totalChars <= MAX_PROMPT_CHARS,
      estimatedPromptCostUsd
    }
  }
}

// ---------------- Send ----------------

export async function sendChat(
  params: SendChatParams,
  webContentsId: number
): Promise<SendChatResult> {
  if (typeof params?.text !== 'string' || !params.text.trim()) {
    return fail('internal', 'Message is empty.')
  }
  const text = params.text.trim()

  const resolved = await resolve(
    {
      conversationId: params.conversationId,
      provider: params.provider,
      modelId: params.modelId,
      attachments: params.attachments,
      pendingText: text
    },
    true
  )
  if (!resolved.ok) return resolved.result
  const r = resolved.value

  if (r.totalChars > MAX_PROMPT_CHARS) {
    return fail(
      'context-too-large',
      `This request is about ${approxTokens(r.totalChars).toLocaleString()} tokens, past the ${approxTokens(MAX_PROMPT_CHARS).toLocaleString()} the app will send at once. Attach fewer decisions or start a new chat.`
    )
  }

  const online = r.provider === 'openrouter'
  const settings = await loadOnlineSettings()

  // Locate or create the conversation, then reconcile its stored provider,
  // model and attachment scope so a reloaded thread cannot drift from what the
  // user is looking at.
  let conversationId = params.conversationId
  let existing = conversationId ? getConversation(r.db, conversationId) : null
  if (conversationId && !existing) {
    return fail('internal', 'That conversation no longer exists.')
  }

  if (online) {
    const expanding =
      existing != null &&
      !existing.onlineConsentGiven &&
      (existing.provider !== 'openrouter' || r.history.length > 0)
    const scopeChanged =
      existing != null &&
      existing.attachments.decisionIds.join(',') !== r.attachments.decisionIds.join(',')
    // Moving an existing local thread online, or widening what a thread sends,
    // means earlier local messages would now leave the device — re-confirm.
    if (!params.onlineConsentConfirmed && (expanding || (scopeChanged && existing != null))) {
      return fail(
        'not-enabled',
        'This thread has messages that have not been sent online yet. Review what will be sent before continuing.'
      )
    }
    if (!params.onlineConsentConfirmed && existing == null) {
      return fail('not-enabled', 'Review what will be sent before starting an online chat.')
    }
  }

  if (!existing) {
    const title = text.length > 60 ? text.slice(0, 57) + '…' : text
    existing = createConversation(r.db, {
      title,
      provider: r.provider,
      modelId: r.modelId,
      attachments: r.attachments
    })
    conversationId = existing.id
  } else {
    if (existing.provider !== r.provider || existing.modelId !== r.modelId) {
      setConversationProvider(r.db, existing.id, r.provider, r.modelId)
    }
    setConversationAttachments(r.db, existing.id, r.attachments)
  }
  const convId = conversationId as string

  // Persist the user turn exactly once, before any token can arrive.
  appendMessage(r.db, convId, { role: 'user', content: text })
  if (online) markOnlineConsent(r.db, convId)

  const requestId = randomUUID()
  const controller = new AbortController()
  const req: ActiveRequest = {
    controller,
    conversationId: convId,
    webContentsId,
    provider: r.provider,
    modelId: r.modelId,
    consentGeneration: settings.consentGeneration,
    vaultGeneration: host?.vaultGeneration() ?? 0,
    partial: ''
  }
  active.set(requestId, req)

  const outbound: ChatMessageOut[] = [
    { role: 'system', content: r.systemPrompt },
    ...r.history.map((m) => ({ role: m.role, content: m.content }) as ChatMessageOut),
    { role: 'user', content: text }
  ]

  void run(requestId, req, outbound).catch((err) => {
    console.error('[ai:send] unexpected', err instanceof Error ? err.name : typeof err)
  })

  return { ok: true, requestId, conversationId: convId }
}

/**
 * True while the request is still authorized. Checked immediately before
 * dispatch and again before persisting a reply.
 */
async function stillAuthorized(req: ActiveRequest): Promise<boolean> {
  if (host?.vaultGeneration() !== req.vaultGeneration) return false
  if (!host?.db()) return false
  if (req.provider !== 'openrouter') return true
  const settings = await loadOnlineSettings()
  if (!settings.enabled) return false
  if (settings.consentGeneration !== req.consentGeneration) return false
  return true
}

async function run(
  requestId: string,
  req: ActiveRequest,
  messages: ChatMessageOut[]
): Promise<void> {
  let servedModel: string | null = null
  let usage: Parameters<typeof commit>[3] = null

  try {
    if (!(await stillAuthorized(req))) {
      throw new OpenRouterError('not-enabled', 'Online AI was turned off before this was sent.')
    }

    if (req.provider === 'ollama') {
      const ollamaMessages: ChatMessageIn[] = messages.map((m) => ({
        role: m.role,
        content: m.content
      }))
      for await (const chunk of chatStream(req.modelId, ollamaMessages, req.controller.signal)) {
        if (chunk.error) throw new OpenRouterError('provider', chunk.error)
        const token = chunk.message?.content ?? ''
        if (token) {
          req.partial += token
          emit(req, { requestId, type: 'token', token })
        }
        if (chunk.done) break
      }
      servedModel = req.modelId
    } else {
      const apiKey = await readOpenRouterKey()
      if (!apiKey) throw new OpenRouterError('no-key', 'No OpenRouter API key is saved.')

      // Enforce ZDR unless the user explicitly accepted this model without it.
      const catalog = await getCachedCatalog()
      const model = catalog.models.find((m) => m.id === req.modelId)
      const settings = await loadOnlineSettings()
      const acknowledged = settings.acknowledgedNonZdrModels.includes(req.modelId)
      const enforceZdr = model ? model.zdrAvailable || !acknowledged : true
      if (model && !model.zdrAvailable && !acknowledged) {
        throw new OpenRouterError(
          'no-private-route',
          'This model has no provider that enforces zero data retention, and you have not accepted using it without one.'
        )
      }

      await streamChatCompletion(
        {
          apiKey,
          model: req.modelId,
          messages,
          signal: req.controller.signal,
          enforceZdr,
          onRetry: (info) =>
            emit(req, {
              requestId,
              type: 'retry',
              attempt: info.attempt,
              maxAttempts: info.maxAttempts,
              waitMs: info.waitMs,
              reason: info.reason
            })
        },
        {
          onToken: (token) => {
            req.partial += token
            emit(req, { requestId, type: 'token', token })
          },
          onDone: (model, u) => {
            servedModel = model
            usage = u
          }
        }
      )
    }

    commit(requestId, req, 'complete', usage, servedModel)
  } catch (err) {
    if (req.controller.signal.aborted) {
      commit(requestId, req, 'interrupted', null, servedModel)
      emit(req, { requestId, type: 'cancelled' })
      active.delete(requestId)
      return
    }
    const { code, message } = describe(err)
    // Keep whatever text did arrive, marked as an incomplete turn.
    commitPartialOnError(req)
    emit(req, { requestId, type: 'error', code, message })
    active.delete(requestId)
    return
  }

  active.delete(requestId)
}

function describe(err: unknown): { code: AiErrorCode; message: string } {
  if (err instanceof OpenRouterError) return { code: err.code, message: err.message }
  if (err instanceof Error && err.message.toLowerCase().includes('ollama')) {
    return { code: 'network', message: 'Ollama is not running.' }
  }
  return { code: 'internal', message: 'The request failed.' }
}

function commit(
  requestId: string,
  req: ActiveRequest,
  status: 'complete' | 'interrupted',
  usage: { promptTokens: number | null; completionTokens: number | null; costUsd: number | null } | null,
  servedModel: string | null
): void {
  const db = host?.db()
  // Re-check the vault generation: a reply that lands after a lock or a restore
  // must not be written into a different database than it was issued against.
  if (!db || host?.vaultGeneration() !== req.vaultGeneration) return
  if (req.partial) {
    appendMessage(db, req.conversationId, {
      role: 'assistant',
      content: req.partial,
      status,
      provider: req.provider,
      modelId: servedModel ?? req.modelId
    })
  }
  if (status === 'complete') {
    emit(req, { requestId, type: 'done', servedModel: servedModel ?? req.modelId, usage })
  }
}

function commitPartialOnError(req: ActiveRequest): void {
  const db = host?.db()
  if (!db || host?.vaultGeneration() !== req.vaultGeneration) return
  if (!req.partial) return
  appendMessage(db, req.conversationId, {
    role: 'assistant',
    content: req.partial,
    status: 'error',
    provider: req.provider,
    modelId: req.modelId
  })
}
