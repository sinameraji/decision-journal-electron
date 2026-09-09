import type { CatalogEntry } from './models'
import type {
  AiErrorCode,
  AiEvent,
  AiProvider,
  LensSelection,
  AttachmentScope,
  ConversationMeta,
  OnlineCatalog,
  OnlineSettings,
  PayloadPreview,
  SendChatParams,
  SendChatResult,
  StoredChatMessage
} from './ai'
import type {
  BorrowedFramework,
  RoleModel,
  RoleModelResult,
  RoleModelSettings
} from './roleModels'
import type {
  MemoryActionResult,
  MemoryBackfillEstimate,
  MemoryCategory,
  MemoryItem,
  MemoryJob,
  MemorySettings,
  MemoryState
} from './memory'

export type ThemeMode = 'light' | 'dark' | 'system'

export type ModelFit = 'ok' | 'tight' | 'too-big'

export interface HardwareProfile {
  totalRamGB: number
  arch: 'arm64' | 'x64' | 'other'
  cpuModel: string
}

export interface OllamaStatus {
  running: boolean
  version: string | null
  hardware: HardwareProfile
}

export interface InstalledModel {
  id: string
  sizeBytes: number
  modifiedAt: number
  digest: string
  parameterSize: string | null
  quantization: string | null
}

export interface CatalogModel extends CatalogEntry {
  fit: ModelFit
  fitReason: string
  installed: boolean
}

export interface ModelInfo {
  id: string
  parameterSize: string | null
  quantization: string | null
  family: string | null
  license: string | null
  sizeBytes: number
}

export type ChatRole = 'user' | 'assistant'

export interface ChatMsg {
  role: ChatRole
  content: string
}

export type OllamaEvent =
  | { requestId: string; type: 'pull-progress'; status: string; completed?: number; total?: number }
  | { requestId: string; type: 'chat-token'; token: string }
  | { requestId: string; type: 'done' }
  | { requestId: string; type: 'error'; message: string }
  | { requestId: string; type: 'cancelled' }

export interface VaultStatus {
  initialized: boolean
  cooldownUntil: number | null
  failedAttempts: number
  touchIdEnabled: boolean
  touchIdAvailable: boolean
}

export interface UnlockResult {
  ok: boolean
  error?: 'wrong-pin' | 'cooldown' | 'invalid-format' | 'internal'
  cooldownUntil?: number
  failedAttempts?: number
}

export const MENTAL_STATES = [
  'energized',
  'focused',
  'relaxed',
  'confident',
  'tired',
  'accepting',
  'accommodating',
  'anxious',
  'resigned',
  'frustrated',
  'angry'
] as const

export type MentalState = (typeof MENTAL_STATES)[number]

export const MENTAL_STATE_LABELS: Record<MentalState, string> = {
  energized: 'Energized',
  focused: 'Focused',
  relaxed: 'Relaxed',
  confident: 'Confident',
  tired: 'Tired',
  accepting: 'Accepting',
  accommodating: 'Accommodating',
  anxious: 'Anxious',
  resigned: 'Resigned',
  frustrated: 'Frustrated',
  angry: 'Angry'
}

export type ExportResult = { ok: true; path: string } | { ok: false; error: string }

export type ImportResult =
  | { ok: true }
  | { ok: false; error: 'wrong-pin' | 'invalid-folder' | 'db-exists' | 'internal' }

export type ReplaceFromBackupResult =
  | { ok: true }
  | { ok: false; error: 'wrong-pin' | 'invalid-folder' | 'not-unlocked' | 'internal' }

export interface Decision {
  id: string
  title: string
  decidedAt: number
  reviewAt: number | null
  mentalState: MentalState[]
  situation: string
  problemStatement: string
  variables: string
  complications: string
  alternatives: string
  rangeOfOutcomes: string
  expectedOutcome: string
  outcome: string
  lessonsLearned: string
  reviewedAt: number | null
  createdAt: number
  updatedAt: number
  isSample: 0 | 1
  /** Opt out of online memory extraction for this entry. */
  memoryExcluded: boolean
}

export type DecisionCreateInput = Pick<
  Decision,
  | 'title'
  | 'decidedAt'
  | 'reviewAt'
  | 'mentalState'
  | 'situation'
  | 'problemStatement'
  | 'variables'
  | 'complications'
  | 'alternatives'
  | 'rangeOfOutcomes'
  | 'expectedOutcome'
  | 'memoryExcluded'
>

export type DecisionUpdateInput = Partial<DecisionCreateInput>

export type DecisionReviewInput = Pick<Decision, 'outcome' | 'lessonsLearned'>

export interface DecisionOption {
  id: string
  name: string
  note: string
  chosen: boolean
}

export type ParsedAlternatives =
  | { kind: 'empty' }
  | { kind: 'legacy'; text: string }
  | { kind: 'structured'; options: DecisionOption[] }

export function parseAlternatives(raw: string | null | undefined): ParsedAlternatives {
  if (raw == null) return { kind: 'empty' }
  if (raw.trim() === '') return { kind: 'empty' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'legacy', text: raw }
  }

  if (!Array.isArray(parsed)) return { kind: 'legacy', text: raw }

  const options: DecisionOption[] = []
  for (const item of parsed) {
    if (item == null || typeof item !== 'object') return { kind: 'legacy', text: raw }
    const o = item as Record<string, unknown>
    if (
      typeof o.id !== 'string' ||
      typeof o.name !== 'string' ||
      typeof o.note !== 'string' ||
      typeof o.chosen !== 'boolean'
    ) {
      return { kind: 'legacy', text: raw }
    }
    options.push({ id: o.id, name: o.name, note: o.note, chosen: o.chosen })
  }
  return { kind: 'structured', options }
}

export function serializeOptions(options: DecisionOption[]): string {
  return JSON.stringify(options)
}

/**
 * Analytical frames a decision can be run through. Each one is a fixed
 * instruction appended to the coach's system prompt — never pasted into the
 * user's message — so the payload preview and consent gate stay accurate.
 */
export const LENS_KINDS = [
  'opportunity-cost',
  'pre-mortem',
  'regret-minimization',
  'counterparty-incentives',
  'portfolio-theory',
  'market-theory'
] as const

export type LensKind = (typeof LENS_KINDS)[number]

export function isLensKind(value: unknown): value is LensKind {
  return typeof value === 'string' && (LENS_KINDS as readonly string[]).includes(value)
}

export const LENS_LABELS: Record<LensKind, string> = {
  'opportunity-cost': 'Opportunity Cost',
  'pre-mortem': 'Pre-mortem',
  'regret-minimization': 'Regret Minimization',
  'counterparty-incentives': 'Counterparty Incentives',
  'portfolio-theory': 'Modern Portfolio Theory',
  'market-theory': 'Market Theory'
}

export const LENS_DESCRIPTIONS: Record<LensKind, string> = {
  'opportunity-cost': "What you're really giving up by picking this one.",
  'pre-mortem': 'Assume it failed in 12 months — what went wrong?',
  'regret-minimization': 'Project ten years out — which option would you regret more?',
  'counterparty-incentives':
    'Who else is in this decision, and how do their incentives change the payoff?',
  'portfolio-theory': 'Treat this as one position in your portfolio, not a decision in isolation.',
  'market-theory': "Treat this as a trade — where's your edge, and who's on the other side?"
}

/**
 * The user turn sent when a lens is run with an empty composer. The lens itself
 * is the instruction, so there is nothing for the user to type — but a request
 * still needs a user message, and the transcript should say plainly what was
 * asked rather than showing a blank turn.
 */
export const LENS_OPENERS: Record<LensKind, string> = {
  'opportunity-cost': 'Run the opportunity-cost lens over this decision.',
  'pre-mortem': 'Run a pre-mortem on this decision.',
  'regret-minimization': 'Run a regret-minimization analysis on this decision.',
  'counterparty-incentives': 'Analyse the counterparty incentives in this decision.',
  'portfolio-theory': 'Run a Modern Portfolio Theory analysis on this decision.',
  'market-theory': 'Analyse this decision through a market-theory lens.'
}

export interface WhisperModelInfo {
  name: string
  label: string
  sizeBytes: number
  sizeLabel: string
  description: string
}

export interface WhisperStatus {
  activeModel: string | null
  installedModels: string[]
  totalMemGB: number
}

export interface WhisperDownloadProgress {
  name: string
  loaded: number
  total: number
}

export interface ConversationSummary {
  id: string
  title: string
  modelId: string
  provider: AiProvider
  updatedAt: number
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; releaseNotes: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

export interface Api {
  vault: {
    status(): Promise<VaultStatus>
    create(pin: string): Promise<UnlockResult>
    unlock(pin: string): Promise<UnlockResult>
    lock(): Promise<void>
    changePin(currentPin: string, newPin: string): Promise<UnlockResult>
    setTouchIdEnabled(enabled: boolean, pin: string): Promise<{ ok: boolean; error?: string }>
    enableTouchIdCurrentSession(): Promise<{ ok: boolean; error?: string }>
    unlockWithTouchId(): Promise<UnlockResult>
    verifyPin(pin: string): Promise<UnlockResult>
    promptTouchIdForAction(reason: string): Promise<{ ok: boolean }>
    export(): Promise<ExportResult>
    pickImportFolder(): Promise<string | null>
    import(folder: string, pin: string): Promise<ImportResult>
    replaceFromBackup(folder: string, pin: string): Promise<ReplaceFromBackupResult>
  }
  decisions: {
    list(): Promise<Decision[]>
    search(query: string): Promise<Decision[]>
    get(id: string): Promise<Decision | null>
    create(input: DecisionCreateInput): Promise<Decision>
    update(id: string, patch: DecisionUpdateInput): Promise<Decision>
    review(id: string, input: DecisionReviewInput): Promise<Decision>
    delete(id: string): Promise<void>
    /** Per-decision opt-out from online memory extraction. */
    setMemoryExcluded(id: string, excluded: boolean): Promise<void>
  }
  conversations: {
    list(): Promise<ConversationSummary[]>
    get(id: string): Promise<ConversationMeta | null>
    messages(id: string): Promise<StoredChatMessage[]>
    setAttachments(id: string, attachments: AttachmentScope): Promise<void>
    delete(id: string): Promise<void>
  }
  memory: {
    getSettings(): Promise<MemorySettings>
    /** Requires online AI to already be on; enabling chat does not enable this. */
    setEnabled(enabled: boolean): Promise<MemorySettings>
    setModel(modelId: string): Promise<MemorySettings>
    list(states?: MemoryState[]): Promise<MemoryItem[]>
    jobs(): Promise<MemoryJob[]>
    approve(id: string): Promise<MemoryActionResult>
    /** Also suppresses the statement so it is not re-proposed on the next edit. */
    reject(id: string): Promise<MemoryActionResult>
    delete(id: string): Promise<MemoryActionResult>
    updateStatement(id: string, statement: string): Promise<MemoryActionResult>
    /** Answering an open question turns it into a memory in the user's words. */
    answer(id: string, answer: string): Promise<MemoryActionResult>
    add(category: MemoryCategory, statement: string): Promise<MemoryActionResult>
    forgetAll(): Promise<MemoryActionResult>
    estimateBackfill(decisionIds: string[]): Promise<MemoryBackfillEstimate>
    runBackfill(decisionIds: string[]): Promise<MemoryActionResult>
    onChanged(cb: () => void): () => void
  }
  roleModels: {
    getSettings(): Promise<RoleModelSettings>
    /** Requires online AI; enabling chat does not enable this. */
    setEnabled(enabled: boolean): Promise<RoleModelSettings>
    setModel(modelId: string): Promise<RoleModelSettings>
    list(): Promise<RoleModel[]>
    /** Adds a name and starts the bounded identification loop. */
    add(query: string): Promise<RoleModelResult>
    confirm(id: string, name: string): Promise<RoleModelResult>
    /** None of the candidates were right; try again with a distinguishing detail. */
    reject(id: string, hint: string): Promise<RoleModelResult>
    rebuild(id: string): Promise<RoleModelResult>
    remove(id: string): Promise<RoleModelResult>
    setFrameworkEnabled(frameworkId: string, enabled: boolean): Promise<RoleModelResult>
    /** Enabled frameworks, for the chat frame picker. */
    frameworks(): Promise<BorrowedFramework[]>
    /** Opens a citation in the browser, only if it is a stored source. */
    openSource(url: string): Promise<{ ok: boolean; error?: string }>
    onChanged(cb: () => void): () => void
  }
  ai: {
    /** Non-secret settings. Never returns the stored API key. */
    getSettings(): Promise<OnlineSettings>
    /** Turning this off also revokes consent for anything still in flight. */
    setEnabled(enabled: boolean): Promise<OnlineSettings>
    setApiKey(key: string): Promise<{ ok: boolean; error?: string }>
    clearApiKey(): Promise<OnlineSettings>
    setDefaultModel(modelId: string): Promise<OnlineSettings>
    catalog(): Promise<OnlineCatalog>
    /** Records that the user accepted a model with no zero-data-retention route. */
    acknowledgeNonZdr(modelId: string): Promise<OnlineSettings>
    refreshCatalog(): Promise<
      { ok: true; catalog: OnlineCatalog } | { ok: false; code: AiErrorCode; message: string }
    >
    preview(params: {
      conversationId: string | null
      provider: AiProvider
      modelId: string
      attachments: AttachmentScope
      includeMemories: boolean
      lens: LensSelection | null
      pendingText: string
    }): Promise<
      { ok: true; preview: PayloadPreview } | { ok: false; code: AiErrorCode; message: string }
    >
    send(params: SendChatParams): Promise<SendChatResult>
    cancel(requestId: string): Promise<void>
    onEvent(cb: (evt: AiEvent) => void): () => void
  }
  theme: {
    get(): Promise<ThemeMode>
    set(mode: ThemeMode): Promise<void>
    onSystemChange(cb: (isDark: boolean) => void): () => void
  }
  app: {
    version(): Promise<string>
    platform(): Promise<string>
    quit(): Promise<void>
    openExternal(url: string): Promise<{ ok: boolean; error?: string }>
    checkForUpdates(): Promise<void>
    downloadUpdate(): Promise<void>
    installUpdate(): Promise<void>
    getAutoUpdateEnabled(): Promise<boolean>
    setAutoUpdateEnabled(enabled: boolean): Promise<void>
    onUpdateStatus(cb: (status: UpdateStatus) => void): () => void
  }
  transcription: {
    getStatus(): Promise<WhisperStatus>
    listAvailableModels(): Promise<WhisperModelInfo[]>
    downloadModel(name: string): Promise<void>
    cancelDownload(): Promise<void>
    setActiveModel(name: string): Promise<void>
    deleteModel(name: string): Promise<void>
    transcribe(samples: ArrayBuffer): Promise<string>
    onDownloadProgress(cb: (progress: WhisperDownloadProgress) => void): () => void
  }
  ollama: {
    status(): Promise<OllamaStatus>
    listInstalled(): Promise<InstalledModel[]>
    catalog(): Promise<CatalogModel[]>
    pull(modelId: string): Promise<string>
    cancel(requestId: string): Promise<void>
    remove(modelId: string): Promise<{ ok: boolean; error?: string }>
    show(modelId: string): Promise<ModelInfo | null>
    onEvent(cb: (evt: OllamaEvent) => void): () => void
    openExternal(url: string): Promise<void>
  }
}

declare global {
  interface Window {
    api: Api
  }
}
