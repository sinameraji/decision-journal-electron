import type { LensKind } from './ipc-contract'

/**
 * Which frame a request runs under. Either one of the four built-in lenses, or
 * a framework borrowed from a role model, addressed by its id.
 */
export type LensSelection =
  | { kind: 'builtin'; lens: LensKind }
  | { kind: 'borrowed'; frameworkId: string }
/**
 * Shared types for the AI provider layer.
 *
 * Two providers exist: `ollama` (local, on-device) and `openrouter` (online,
 * opt-in). Everything online is disabled by default and requires the user's own
 * OpenRouter API key. See src/main/ai/ for the main-process implementation.
 */

export type AiProvider = 'ollama' | 'openrouter'

export const AI_PROVIDERS: readonly AiProvider[] = ['ollama', 'openrouter'] as const

export function isAiProvider(value: unknown): value is AiProvider {
  return value === 'ollama' || value === 'openrouter'
}

/**
 * Model new online conversations start on once OpenRouter is activated.
 * The user can change it in Settings or from the chat header at any time.
 *
 * Note on price: under the zero-data-retention routing this app forces, Sol is
 * roughly $5.50/M input and $33/M output — well above the public list price,
 * and ~25x `openai/gpt-5.6-luna`. The picker shows the real ZDR price per model.
 */
export const DEFAULT_ONLINE_MODEL = 'openai/gpt-5.6-sol'

/**
 * Non-secret OpenRouter settings. The API key itself is never part of this
 * object and is never returned over IPC — only `hasKey` / `keyHint`.
 */
/** Escalating waits between retries, in ms. */
export const RETRY_BACKOFF_MS = [2_000, 3_000, 5_000, 10_000] as const

export interface OnlineSettings {
  /** Master switch. False on fresh installs and on upgrade. */
  enabled: boolean
  /** Whether a key is stored in the OS credential record. */
  hasKey: boolean
  /** Last 4 characters of the stored key, for display only. Null when no key. */
  keyHint: string | null
  /**
   * A key is stored but this build cannot decrypt it — normally because the app
   * was re-signed under a different Apple team. The user must re-enter it.
   */
  keyUnreadable: boolean
  /** Model used for new online conversations. */
  defaultModel: string
  /**
   * Consent generation. Incremented whenever online is disabled or the key is
   * removed, so in-flight requests issued under an older generation can be
   * dropped rather than committed.
   */
  consentGeneration: number
  /** Unix ms of the last successful catalog refresh, or null. */
  catalogFetchedAt: number | null
  /**
   * Models the user has explicitly accepted using *without* zero-data-retention
   * routing. Stored rather than asked each time, so an automatic path can check
   * whether consent was ever actually given.
   */
  acknowledgedNonZdrModels: string[]
}

/** One model from the OpenRouter catalog, filtered to what this app can use. */
export interface OnlineModel {
  id: string
  name: string
  contextLength: number
  /** USD per million prompt tokens. Null when OpenRouter reports no price. */
  promptUsdPerMillion: number | null
  /** USD per million completion tokens. Null when OpenRouter reports no price. */
  completionUsdPerMillion: number | null
  supportsStructuredOutputs: boolean
  /** True when the model appears in OpenRouter's zero-data-retention endpoint list. */
  zdrAvailable: boolean
  /**
   * How many distinct zero-data-retention *routes* serve this model. Counted by
   * endpoint tag rather than provider name: `azure/us`, `azure/eu` and `azure`
   * are three separate deployments with their own capacity, even though they
   * are one company. Fewer routes means less headroom when one is degraded.
   */
  zdrProviderCount: number
  /** Endpoint tags of those routes, for the picker. */
  zdrProviders: string[]
}

export interface OnlineCatalog {
  models: OnlineModel[]
  fetchedAt: number
}

/** Token accounting returned by the provider, when it reports any. */
export interface AiUsage {
  promptTokens: number | null
  completionTokens: number | null
  /** Cost in USD as reported by OpenRouter. Null for local models. */
  costUsd: number | null
}

export type AiEvent =
  | { requestId: string; type: 'token'; token: string }
  | {
      requestId: string
      type: 'retry'
      attempt: number
      maxAttempts: number
      waitMs: number
      /** Human-readable reason, shown while waiting. */
      reason: string
    }
  | {
      requestId: string
      type: 'done'
      /** Model the provider actually served, when it reports one. */
      servedModel: string | null
      usage: AiUsage | null
    }
  | { requestId: string; type: 'error'; code: AiErrorCode; message: string }
  | { requestId: string; type: 'cancelled' }

export type AiErrorCode =
  | 'locked'
  | 'not-enabled'
  | 'no-key'
  | 'invalid-key'
  | 'insufficient-credit'
  | 'rate-limited'
  | 'no-private-route'
  | 'context-too-large'
  | 'network'
  | 'timeout'
  | 'provider'
  | 'cancelled'
  | 'internal'

export const AI_ERROR_HINTS: Record<AiErrorCode, string> = {
  locked: 'Your journal is locked. Unlock it and try again.',
  'not-enabled': 'Online AI is turned off. Enable it in Settings → Online AI.',
  'no-key': 'No OpenRouter API key is saved. Add one in Settings → Online AI.',
  'invalid-key': 'OpenRouter rejected the API key. Replace it in Settings → Online AI.',
  'insufficient-credit': 'Your OpenRouter account is out of credit.',
  'rate-limited':
    'The model provider is rate-limiting these requests — this is not your API key or your account. Retrying automatically; if it keeps happening, pick a model served by more zero-data-retention routes.',
  'no-private-route':
    'No provider enforcing zero data retention is available for this model right now. We will not fall back to one that keeps your data. Try again, or pick a different model.',
  'context-too-large':
    'The attached decisions are too long for this model. Attach fewer decisions and try again.',
  network: 'Could not reach OpenRouter. Check your internet connection.',
  timeout: 'OpenRouter did not respond in time.',
  provider: 'The model provider returned an error.',
  cancelled: 'Stopped.',
  internal: 'Something went wrong.'
}

/** Which decisions a conversation is allowed to send. */
export interface AttachmentScope {
  decisionIds: string[]
}

export const EMPTY_ATTACHMENT_SCOPE: AttachmentScope = { decisionIds: [] }

export type MessageStatus = 'complete' | 'interrupted' | 'error'

export interface StoredChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  status: MessageStatus
  /** Provider/model that produced an assistant message. Null for user messages. */
  provider: AiProvider | null
  modelId: string | null
}

export interface ConversationMeta {
  id: string
  title: string
  provider: AiProvider
  modelId: string
  attachments: AttachmentScope
  /** True once a message in this thread has actually been sent online. */
  onlineConsentGiven: boolean
  /** Whether approved memories are sent with this conversation. Off by default. */
  includeMemories: boolean
  /** Analytical frame this thread is running under, if any. */
  lens: LensSelection | null
  createdAt: number
  updatedAt: number
}

/** What the app will send for a given request, for the payload preview UI. */
export interface PayloadPreview {
  provider: AiProvider
  modelId: string
  systemPrompt: string
  messages: { role: string; content: string }[]
  attachedDecisionTitles: string[]
  /** Rough character count of everything that would be transmitted. */
  totalChars: number
  approxTokens: number
  /** Null when the model's context length is unknown. */
  contextLimit: number | null
  withinBudget: boolean
  /** Estimated prompt cost in USD at catalog rates. Null when unknown. */
  estimatedPromptCostUsd: number | null
  /** True when approved memories are part of this payload. */
  memoriesIncluded: boolean
  /** Human-readable name of the frame in this payload, if any. */
  lensLabel: string | null
}

export interface SendChatParams {
  conversationId: string | null
  provider: AiProvider
  modelId: string
  text: string
  attachments: AttachmentScope
  includeMemories: boolean
  /** Analytical frame to apply, appended to the system prompt. */
  lens: LensSelection | null
  /** Set once the user has reviewed the online disclosure for this thread. */
  onlineConsentConfirmed: boolean
}

export type SendChatResult =
  | { ok: true; requestId: string; conversationId: string }
  | { ok: false; code: AiErrorCode; message: string }
