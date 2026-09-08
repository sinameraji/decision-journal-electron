/**
 * OpenRouter HTTP client. Every request goes through the gated online session in
 * ./network.ts, so an accidental change of base URL or a redirect to another
 * host is cancelled by the session filter rather than silently followed.
 */

import type { AiUsage, OnlineModel } from '@shared/ai'
import { RETRY_BACKOFF_MS } from '@shared/ai'
import { asNetworkError, errorForStatus, OpenRouterError } from './errors'
import { isAllowedOpenRouterUrl, onlineSession, OPENROUTER_API_PREFIX } from './network'
import { isDoneSentinel, SseParser } from './sse'

export { OpenRouterError, errorForStatus } from './errors'

const CONNECT_TIMEOUT_MS = 20_000
const IDLE_TIMEOUT_MS = 90_000
const OVERALL_TIMEOUT_MS = 10 * 60_000

const APP_TITLE = 'Decision Journal'

function headers(apiKey: string | null): Record<string, string> {
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Title': APP_TITLE,
    // OpenRouter documents that per-request ZDR does not by itself make a
    // response ineligible for its response cache; this opts out explicitly.
    'X-OpenRouter-Cache': 'false'
  }
  if (apiKey) base['Authorization'] = `Bearer ${apiKey}`
  return base
}

async function gatedFetch(url: string, init: RequestInit): Promise<Response> {
  if (!isAllowedOpenRouterUrl(url)) {
    throw new OpenRouterError('internal', 'Refusing to request a non-allowlisted URL.')
  }
  const ses = onlineSession()
  // `redirect: 'error'` keeps a cross-origin redirect from being followed even
  // before the session filter would cancel it.
  return ses.fetch(url, { ...init, redirect: 'error', credentials: 'omit' })
}

// ---------------- Catalog ----------------

interface RawModel {
  id?: string
  name?: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
  supported_parameters?: string[]
}

interface RawZdrEndpoint {
  model_id?: string
  model_name?: string
  provider_name?: string
  tag?: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
  supported_parameters?: string[]
}

function perMillion(value: string | undefined): number | null {
  if (typeof value !== 'string') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n * 1_000_000
}

/**
 * Fetches the model catalog and the zero-data-retention endpoint list, and
 * returns every model flagged with whether it has a ZDR route and how many.
 *
 * Non-ZDR models used to be filtered out entirely. Hiding them made the
 * constraint invisible: a user could not tell whether a model was missing
 * because it does not exist or because it fails our privacy bar. They are now
 * returned and marked, and selecting one requires explicit acknowledgement.
 */
export async function fetchOnlineCatalog(apiKey: string | null): Promise<OnlineModel[]> {
  const [modelsRes, zdrRes] = await Promise.all([
    gatedFetch(`${OPENROUTER_API_PREFIX}models`, {
      method: 'GET',
      headers: headers(apiKey),
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS)
    }),
    gatedFetch(`${OPENROUTER_API_PREFIX}endpoints/zdr`, {
      method: 'GET',
      headers: headers(apiKey),
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS)
    })
  ])

  if (!modelsRes.ok) throw errorForStatus(modelsRes.status, '')
  if (!zdrRes.ok) throw errorForStatus(zdrRes.status, '')

  const modelsBody = (await modelsRes.json()) as { data?: RawModel[] }
  const zdrBody = (await zdrRes.json()) as { data?: RawZdrEndpoint[] }

  // A model can have several ZDR endpoints; keep the cheapest prompt price and
  // the union of structured-output support.
  const zdr = new Map<string, { model: OnlineModel; providers: Set<string> }>()
  for (const e of zdrBody.data ?? []) {
    if (!e.model_id) continue
    const prompt = perMillion(e.pricing?.prompt)
    const completion = perMillion(e.pricing?.completion)
    const structured = (e.supported_parameters ?? []).includes('structured_outputs')
    const existing = zdr.get(e.model_id)
    if (!existing) {
      zdr.set(e.model_id, {
        providers: new Set(e.tag ? [e.tag] : []),
        model: {
          id: e.model_id,
          name: e.model_name ?? e.model_id,
          contextLength: e.context_length ?? 0,
          promptUsdPerMillion: prompt,
          completionUsdPerMillion: completion,
          supportsStructuredOutputs: structured,
          zdrAvailable: true,
          zdrProviderCount: e.tag ? 1 : 0,
          zdrProviders: e.tag ? [e.tag] : []
        }
      })
      continue
    }
    if (e.tag) existing.providers.add(e.tag)
    const m = existing.model
    if (prompt !== null && (m.promptUsdPerMillion === null || prompt < m.promptUsdPerMillion)) {
      m.promptUsdPerMillion = prompt
      m.completionUsdPerMillion = completion
    }
    m.supportsStructuredOutputs = m.supportsStructuredOutputs || structured
    m.contextLength = Math.max(m.contextLength, e.context_length ?? 0)
  }

  const out: OnlineModel[] = []
  const seen = new Set<string>()

  for (const m of modelsBody.data ?? []) {
    if (!m.id) continue
    seen.add(m.id)
    const entry = zdr.get(m.id)
    if (entry) {
      entry.model.name = m.name ?? entry.model.name
      if (m.context_length) entry.model.contextLength = m.context_length
      entry.model.supportsStructuredOutputs =
        entry.model.supportsStructuredOutputs ||
        (m.supported_parameters ?? []).includes('structured_outputs')
      entry.model.zdrProviders = [...entry.providers].sort()
      entry.model.zdrProviderCount = entry.providers.size
      out.push(entry.model)
      continue
    }
    out.push({
      id: m.id,
      name: m.name ?? m.id,
      contextLength: m.context_length ?? 0,
      promptUsdPerMillion: perMillion(m.pricing?.prompt),
      completionUsdPerMillion: perMillion(m.pricing?.completion),
      supportsStructuredOutputs: (m.supported_parameters ?? []).includes('structured_outputs'),
      zdrAvailable: false,
      zdrProviderCount: 0,
      zdrProviders: []
    })
  }

  // ZDR-only entries the /models list did not include.
  for (const [id, entry] of zdr) {
    if (seen.has(id)) continue
    entry.model.zdrProviders = [...entry.providers].sort()
    entry.model.zdrProviderCount = entry.providers.size
    out.push(entry.model)
  }

  return out.sort((a, b) => {
    if (a.zdrAvailable !== b.zdrAvailable) return a.zdrAvailable ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

// ---------------- Chat completions ----------------

export interface ChatMessageOut {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamCallbacks {
  onToken(token: string): void
  onDone(servedModel: string | null, usage: AiUsage | null): void
}

export interface ChatRequest {
  apiKey: string
  model: string
  messages: ChatMessageOut[]
  signal: AbortSignal
  /** JSON-schema structured output. Adds `require_parameters` routing. */
  responseFormat?: unknown
  /**
   * Restrict routing to zero-data-retention providers. True unless the user has
   * explicitly accepted this model without one.
   */
  enforceZdr: boolean
  /** Reports each wait before a retry, so the UI can explain the delay. */
  onRetry?: (info: { attempt: number; maxAttempts: number; waitMs: number; reason: string }) => void
}

/**
 * Privacy routing applied to every request that can carry journal content.
 * `zdr: true` restricts routing to zero-data-retention endpoints and
 * `data_collection: 'deny'` excludes providers that may train on inputs. If no
 * route satisfies both, the request fails — it is never retried with these
 * relaxed.
 */
function providerRouting(
  requireParameters: boolean,
  enforceZdr: boolean
): Record<string, unknown> {
  // When the user has explicitly accepted a model with no ZDR route, sending
  // zdr:true would just fail every time. data_collection stays 'deny' either
  // way: refusing training on inputs is available far more widely than ZDR.
  const routing: Record<string, unknown> = enforceZdr
    ? { zdr: true, data_collection: 'deny' }
    : { data_collection: 'deny' }
  // Only demand exact parameter support when we actually depend on a parameter.
  // Several ZDR routes advertise `max_completion_tokens` rather than
  // `max_tokens`, so a blanket requirement would exclude them.
  if (requireParameters) routing.require_parameters = true
  return routing
}

/**
 * Transient upstream conditions worth another attempt. 404 is included only
 * when the body says no compliant route was found: with ZDR enforced that
 * usually means every private provider is momentarily busy, not that the model
 * does not exist.
 */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504])
const MAX_ATTEMPTS = RETRY_BACKOFF_MS.length + 1

/**
 * Retrying is only safe before any token has been emitted. A 429 or 502 arrives
 * before generation starts, so nothing was produced and nothing was billed —
 * unlike a mid-stream failure, where a retry would duplicate a paid completion.
 */
export async function streamChatCompletion(
  req: ChatRequest,
  cb: StreamCallbacks
): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptStreamChatCompletion(req, cb)
    } catch (err) {
      lastError = err
      if (!(err instanceof PreStreamHttpError) || req.signal.aborted) break
      const noPrivateRoute = err.toOpenRouterError().code === 'no-private-route'
      const retryable = RETRYABLE_STATUS.has(err.status) || noPrivateRoute
      if (!retryable || attempt === MAX_ATTEMPTS) break

      const wait = err.retryAfterMs ?? RETRY_BACKOFF_MS[attempt - 1]
      req.onRetry?.({
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        waitMs: wait,
        reason: noPrivateRoute
          ? 'Waiting for an OpenRouter provider that enforces zero data retention'
          : 'The model provider is busy'
      })
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  if (lastError instanceof PreStreamHttpError) throw lastError.toOpenRouterError()
  throw lastError
}

/** Carries the status so the retry loop can decide, without losing the mapping. */
class PreStreamHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryAfterMs: number | null
  ) {
    super(`HTTP ${status}`)
  }
  toOpenRouterError(): OpenRouterError {
    return errorForStatus(this.status, this.body)
  }
}

function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get('retry-after')
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 10_000)
  const at = Date.parse(raw)
  if (!Number.isNaN(at)) return Math.min(Math.max(at - Date.now(), 0), 10_000)
  return null
}

async function attemptStreamChatCompletion(
  req: ChatRequest,
  cb: StreamCallbacks
): Promise<void> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    stream: true,
    usage: { include: true },
    provider: providerRouting(req.responseFormat !== undefined, req.enforceZdr)
  }
  if (req.responseFormat !== undefined) body.response_format = req.responseFormat

  const overall = new AbortController()
  const onOuterAbort = (): void => overall.abort()
  req.signal.addEventListener('abort', onOuterAbort, { once: true })
  const overallTimer = setTimeout(() => overall.abort(), OVERALL_TIMEOUT_MS)

  try {
    let res: Response
    try {
      res = await gatedFetch(`${OPENROUTER_API_PREFIX}chat/completions`, {
        method: 'POST',
        headers: headers(req.apiKey),
        body: JSON.stringify(body),
        signal: overall.signal
      })
    } catch (err) {
      if (req.signal.aborted) throw new OpenRouterError('cancelled', 'Stopped.')
      throw asNetworkError(err)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      // Nothing has streamed yet, so the retry loop may safely try again.
      throw new PreStreamHttpError(res.status, text, retryAfterMs(res))
    }
    if (!res.body) throw new OpenRouterError('provider', 'OpenRouter returned an empty response.')

    const reader = res.body.getReader()
    const parser = new SseParser()
    let servedModel: string | null = null
    let usage: AiUsage | null = null
    let sawContent = false
    let finished = false

    try {
      for (;;) {
        const chunk = await readWithIdleTimeout(reader, req.signal)
        if (chunk === 'aborted') throw new OpenRouterError('cancelled', 'Stopped.')
        if (chunk.done) {
          for (const evt of parser.end()) {
            const outcome = handleFrame(evt.data, cb, (m) => (servedModel = m), (u) => (usage = u))
            if (outcome === 'content') sawContent = true
            if (outcome === 'finished') finished = true
          }
          break
        }
        for (const evt of parser.push(chunk.value)) {
          const outcome = handleFrame(evt.data, cb, (m) => (servedModel = m), (u) => (usage = u))
          if (outcome === 'content') sawContent = true
          if (outcome === 'finished') finished = true
        }
      }
    } finally {
      try {
        await reader.cancel()
      } catch {
        // stream already closed
      }
    }

    if (!finished && !sawContent) {
      throw new OpenRouterError(
        'provider',
        'The stream ended before the model produced any output.'
      )
    }
    cb.onDone(servedModel, usage)
  } finally {
    clearTimeout(overallTimer)
    req.signal.removeEventListener('abort', onOuterAbort)
  }
}

type ReadResult = { done: false; value: Uint8Array } | { done: true; value: undefined }

async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal
): Promise<ReadResult | 'aborted'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const idle = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new OpenRouterError('timeout', 'OpenRouter stopped sending data.')),
      IDLE_TIMEOUT_MS
    )
  })
  try {
    const result = (await Promise.race([reader.read(), idle])) as ReadResult
    if (signal.aborted) return 'aborted'
    return result
  } catch (err) {
    if (signal.aborted) return 'aborted'
    if (err instanceof OpenRouterError) throw err
    throw asNetworkError(err)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

interface StreamChunk {
  model?: string
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  error?: { message?: string; code?: number | string; metadata?: unknown }
}

/**
 * OpenRouter can report a provider failure *after* a 200 by sending an `error`
 * object inside the stream, so error handling cannot stop at the status code.
 */
function handleFrame(
  data: string,
  cb: StreamCallbacks,
  setModel: (m: string) => void,
  setUsage: (u: AiUsage) => void
): 'content' | 'finished' | 'none' {
  if (isDoneSentinel(data)) return 'finished'
  let parsed: StreamChunk
  try {
    parsed = JSON.parse(data) as StreamChunk
  } catch {
    return 'none'
  }

  if (parsed.error) {
    throw errorForStatus(
      typeof parsed.error.code === 'number' ? parsed.error.code : 500,
      parsed.error.message ?? ''
    )
  }

  if (parsed.model) setModel(parsed.model)
  if (parsed.usage) {
    setUsage({
      promptTokens: parsed.usage.prompt_tokens ?? null,
      completionTokens: parsed.usage.completion_tokens ?? null,
      costUsd: typeof parsed.usage.cost === 'number' ? parsed.usage.cost : null
    })
  }

  let emitted = false
  for (const choice of parsed.choices ?? []) {
    const token = choice.delta?.content
    if (typeof token === 'string' && token.length > 0) {
      cb.onToken(token)
      emitted = true
    }
    if (choice.finish_reason) return emitted ? 'content' : 'finished'
  }
  return emitted ? 'content' : 'none'
}
