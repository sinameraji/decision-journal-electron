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

/** Model we default new online conversations to once OpenRouter is activated. */
export const DEFAULT_ONLINE_MODEL = 'openai/gpt-5.6-luna'

/**
 * Non-secret OpenRouter settings. The API key itself is never part of this
 * object and is never returned over IPC — only `hasKey` / `keyHint`.
 */
export interface OnlineSettings {
  /** Master switch. False on fresh installs and on upgrade. */
  enabled: boolean
  /** Whether a key is stored in the OS credential record. */
  hasKey: boolean
  /** Last 4 characters of the stored key, for display only. Null when no key. */
  keyHint: string | null
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
  'rate-limited': 'OpenRouter is rate-limiting this key. Wait a moment and try again.',
  'no-private-route':
    'No zero-data-retention route is available for this model right now. Pick another model — we will not fall back to a route that retains your data.',
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
}

export interface SendChatParams {
  conversationId: string | null
  provider: AiProvider
  modelId: string
  text: string
  attachments: AttachmentScope
  /** Set once the user has reviewed the online disclosure for this thread. */
  onlineConsentConfirmed: boolean
}

export type SendChatResult =
  | { ok: true; requestId: string; conversationId: string }
  | { ok: false; code: AiErrorCode; message: string }
