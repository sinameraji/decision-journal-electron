export type ThemeMode = 'light' | 'dark' | 'system'

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
  }
  decisions: {
    list(): Promise<Decision[]>
    search(query: string): Promise<Decision[]>
    get(id: string): Promise<Decision | null>
    create(input: DecisionCreateInput): Promise<Decision>
    update(id: string, patch: DecisionUpdateInput): Promise<Decision>
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
  }
}

declare global {
  interface Window {
    api: Api
  }
}
