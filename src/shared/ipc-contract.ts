import type { CatalogEntry } from './models'

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
>

export type DecisionUpdateInput = Partial<DecisionCreateInput>

export type DecisionReviewInput = Pick<Decision, 'outcome' | 'lessonsLearned'>

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

export interface Conversation {
  id: string
  title: string
  modelId: string
  createdAt: number
  updatedAt: number
}

export interface ConversationSummary {
  id: string
  title: string
  modelId: string
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
  }
  conversations: {
    create(modelId: string, title: string): Promise<Conversation>
    list(): Promise<ConversationSummary[]>
    messages(id: string): Promise<ChatMsg[]>
    appendMessage(id: string, role: string, content: string): Promise<void>
    delete(id: string): Promise<void>
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
    chat(modelId: string, messages: ChatMsg[]): Promise<string>
    onEvent(cb: (evt: OllamaEvent) => void): () => void
    openExternal(url: string): Promise<void>
  }
}

declare global {
  interface Window {
    api: Api
  }
}
