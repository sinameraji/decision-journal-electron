/**
 * Serialized extraction queue.
 *
 * A decision save must succeed whether or not the network works, so extraction
 * never runs inline: saving enqueues an encrypted job and returns. The worker
 * then processes one job at a time, revalidating authorization both before the
 * request leaves and again before anything is written back.
 */

import type Database from 'better-sqlite3-multiple-ciphers'
import { BrowserWindow } from 'electron'
import type { AiErrorCode } from '@shared/ai'
import { getDecision } from '../db/decisions'
import { renderDecision } from '../ai/context'
import { readOpenRouterKey } from '../ai/credentials'
import { loadOnlineSettings } from '../ai/settings'
import { getCachedCatalog } from '../ai/catalog'
import { OpenRouterError, streamChatCompletion } from '../ai/openrouterClient'
import {
  CONTRADICTION_NOTE,
  EXTRACTION_INSTRUCTION,
  EXTRACTION_RESPONSE_FORMAT,
  PROMPT_VERSION
} from './prompt'
import {
  type ClaimedJob,
  claimNextJob,
  countQueuedJobs,
  enqueueJob,
  finishJob,
  getMemoryModel,
  insertProposals,
  isDecisionExcluded,
  isMemoryEnabled,
  isSuppressed,
  listItems,
  requeueJob
} from './store'
import { validateProposals } from './validate'

export interface MemoryHost {
  db(): Database.Database | null
  vaultGeneration(): number
  defaultModel(): Promise<string>
}

let host: MemoryHost | null = null

export function configureMemoryQueue(next: MemoryHost): void {
  host = next
}

const MAX_ATTEMPTS = 4
const BASE_BACKOFF_MS = 5_000
const DEBOUNCE_MS = 4_000
const MAX_CONTRADICTION_ITEMS = 20
const MAX_CONTRADICTION_CHARS = 4_000

/** Errors worth retrying. Anything else is a standing condition the user fixes. */
const RETRYABLE: ReadonlySet<AiErrorCode> = new Set([
  'network',
  'timeout',
  'rate-limited',
  'provider'
])

let running = false
let stopRequested = false
let debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
let backoffTimer: ReturnType<typeof setTimeout> | null = null
let controller: AbortController | null = null

function notify(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('memory:changed')
  }
}

/**
 * Called after a decision is created, updated or reviewed. Debounced so a burst
 * of edits produces one job rather than one per keystroke-save.
 */
export function scheduleExtraction(decisionId: string): void {
  const existing = debounceTimers.get(decisionId)
  if (existing) clearTimeout(existing)
  debounceTimers.set(
    decisionId,
    setTimeout(() => {
      debounceTimers.delete(decisionId)
      void enqueueNow(decisionId)
    }, DEBOUNCE_MS)
  )
}

export async function enqueueNow(decisionId: string): Promise<boolean> {
  const db = host?.db()
  if (!db) return false
  if (!isMemoryEnabled(db)) return false

  const online = await loadOnlineSettings()
  if (!online.enabled) return false

  const decision = getDecision(db, decisionId)
  if (!decision) return false
  if (decision.isSample === 1) return false
  if (isDecisionExcluded(db, decisionId)) return false

  enqueueJob(db, {
    decisionId,
    contentRevision: decision.updatedAt,
    promptVersion: PROMPT_VERSION,
    consentGeneration: online.consentGeneration
  })
  notify()
  void pump()
  return true
}

/** Stops the worker and cancels any request in flight. */
export function stopQueue(): void {
  stopRequested = true
  controller?.abort()
  for (const timer of debounceTimers.values()) clearTimeout(timer)
  debounceTimers = new Map()
  if (backoffTimer) {
    clearTimeout(backoffTimer)
    backoffTimer = null
  }
}

export function resumeQueue(): void {
  stopRequested = false
  void pump()
}

export function queueDepth(): number {
  const db = host?.db()
  return db ? countQueuedJobs(db) : 0
}

async function pump(): Promise<void> {
  if (running || stopRequested) return
  running = true
  try {
    for (;;) {
      if (stopRequested) break
      const db = host?.db()
      if (!db) break
      if (!isMemoryEnabled(db)) break

      const job = claimNextJob(db)
      if (!job) break

      const outcome = await runJob(db, job)
      notify()
      if (outcome === 'stop') break
      if (outcome === 'backoff') {
        // Wait before the next attempt rather than spinning on a bad network.
        await new Promise<void>((resolve) => {
          backoffTimer = setTimeout(resolve, BASE_BACKOFF_MS * Math.pow(2, job.attempts - 1))
        })
        backoffTimer = null
      }
    }
  } finally {
    running = false
  }
}

type JobOutcome = 'done' | 'backoff' | 'stop'

async function runJob(db: Database.Database, job: ClaimedJob): Promise<JobOutcome> {
  const vaultGenerationAtStart = host?.vaultGeneration() ?? 0

  const online = await loadOnlineSettings()
  if (!online.enabled || online.consentGeneration !== job.consentGeneration) {
    finishJob(db, job.id, 'cancelled', 'Online AI was turned off.')
    return 'stop'
  }
  if (job.promptVersion !== PROMPT_VERSION) {
    finishJob(db, job.id, 'cancelled', 'The extraction prompt changed after this was queued.')
    return 'done'
  }

  const decision = getDecision(db, job.decisionId)
  if (!decision) {
    finishJob(db, job.id, 'cancelled', 'The decision was deleted.')
    return 'done'
  }
  if (isDecisionExcluded(db, job.decisionId)) {
    finishJob(db, job.id, 'cancelled', 'Excluded from memory.')
    return 'done'
  }
  if (decision.updatedAt !== job.contentRevision) {
    // Edited again after queueing; a newer job already covers it.
    finishJob(db, job.id, 'cancelled', 'Superseded by a newer edit.')
    return 'done'
  }

  const apiKey = await readOpenRouterKey()
  if (!apiKey) {
    finishJob(db, job.id, 'error', 'No OpenRouter API key is saved.')
    return 'stop'
  }

  const fallbackModel = host ? await host.defaultModel() : ''
  const modelId = getMemoryModel(db, fallbackModel)
  if (!modelId) {
    finishJob(db, job.id, 'error', 'No extraction model is configured.')
    return 'stop'
  }

  // Extraction is ZDR-only, with no override. Chat lets the user knowingly
  // accept a model without zero data retention, because they press send and see
  // the disclosure each time. Extraction has no such moment: it runs by itself
  // after every save. Accepting weaker retention for a background process is a
  // different bargain from accepting it for one conversation, so it is refused
  // rather than offered.
  const catalog = await getCachedCatalog()
  const model = catalog.models.find((m) => m.id === modelId)
  if (model && !model.zdrAvailable) {
    finishJob(
      db,
      job.id,
      'error',
      `${model.name} has no provider that enforces zero data retention. Memory extraction only runs on models that do — pick a different extraction model in Settings.`
    )
    return 'stop'
  }

  const approved = listItems(db, ['approved'])
    .slice(0, MAX_CONTRADICTION_ITEMS)
    .map((i) => `- [${i.category}] ${i.statement}`)
    .join('\n')
    .slice(0, MAX_CONTRADICTION_CHARS)

  const userContent = [
    'Journal entry to extract from:',
    '',
    renderDecision(decision, 1),
    '',
    approved ? `${CONTRADICTION_NOTE}\n\nAlready approved memories:\n${approved}` : ''
  ]
    .join('\n')
    .trim()

  controller = new AbortController()
  let body = ''
  try {
    await streamChatCompletion(
      {
        apiKey,
        model: modelId,
        messages: [
          { role: 'system', content: EXTRACTION_INSTRUCTION },
          { role: 'user', content: userContent }
        ],
        signal: controller.signal,
        responseFormat: EXTRACTION_RESPONSE_FORMAT,
        enforceZdr: true
      },
      {
        onToken: (token) => {
          body += token
        },
        onDone: () => {}
      }
    )
  } catch (err) {
    const code = err instanceof OpenRouterError ? err.code : 'internal'
    const message = err instanceof OpenRouterError ? err.message : 'Extraction failed.'
    if (controller.signal.aborted) {
      requeueJob(db, job.id, 'Paused.')
      return 'stop'
    }
    if (RETRYABLE.has(code) && job.attempts < MAX_ATTEMPTS) {
      requeueJob(db, job.id, message)
      return 'backoff'
    }
    finishJob(db, job.id, 'error', message)
    return RETRYABLE.has(code) ? 'done' : 'stop'
  } finally {
    controller = null
  }

  // Re-check everything before committing: the vault may have been locked or
  // restored, or consent revoked, while the request was in flight.
  const currentDb = host?.db()
  if (!currentDb || host?.vaultGeneration() !== vaultGenerationAtStart) return 'stop'
  const settingsNow = await loadOnlineSettings()
  if (!settingsNow.enabled || settingsNow.consentGeneration !== job.consentGeneration) {
    finishJob(currentDb, job.id, 'cancelled', 'Consent changed while this was running.')
    return 'stop'
  }
  const decisionNow = getDecision(currentDb, job.decisionId)
  if (!decisionNow || decisionNow.updatedAt !== job.contentRevision) {
    finishJob(currentDb, job.id, 'cancelled', 'The decision changed while this was running.')
    return 'done'
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    finishJob(currentDb, job.id, 'error', 'The model did not return valid JSON.')
    return 'done'
  }

  // Model output is a proposal, never a database instruction.
  const result = validateProposals(parsed, decisionNow, (category, statement) =>
    isSuppressed(currentDb, category, statement)
  )
  insertProposals(currentDb, {
    decisionId: job.decisionId,
    revision: job.contentRevision,
    modelId,
    promptVersion: PROMPT_VERSION,
    proposals: result.accepted
  })

  const note =
    result.rejected.length > 0
      ? `Discarded ${result.rejected.length} unsupported proposal${result.rejected.length === 1 ? '' : 's'}.`
      : undefined
  finishJob(currentDb, job.id, 'done', note)
  return 'done'
}
