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

export type Stakes = 'low' | 'medium' | 'high'
export type DecisionResult = 'better' | 'as_expected' | 'worse'

export const DECISION_CATEGORIES = [
  'career',
  'money',
  'relationships',
  'health',
  'creative',
  'other'
] as const
export type DecisionCategory = (typeof DECISION_CATEGORIES)[number]

export interface Decision {
  id: string
  title: string
  body: string
  createdAt: number
  reviewAt: number | null
  isSample: 0 | 1
  confidence: number | null
  category: DecisionCategory | null
  stakes: Stakes | null
  predictedOutcome: string | null
  alternativesConsidered: string | null
  resolvedAt: number | null
  actualOutcome: string | null
  result: DecisionResult | null
  processQuality: number | null
  outcomeQuality: number | null
  lessons: string | null
}

export interface CreateDecisionInput {
  title: string
  body: string
  category: DecisionCategory
  stakes: Stakes
  confidence: number
  predictedOutcome: string
  alternativesConsidered: string
  reviewAt: number | null
}

export interface ReviewDecisionInput {
  id: string
  actualOutcome: string
  result: DecisionResult
  processQuality: number
  outcomeQuality: number
  lessons: string
}

export interface CalibrationBucket {
  /** lower bound of the bucket, 0..90 in steps of 10 */
  lower: number
  /** upper bound of the bucket, 10..100 in steps of 10 */
  upper: number
  count: number
  hits: number
  /** null when count is 0 */
  hitRate: number | null
}

export interface CalibrationData {
  buckets: CalibrationBucket[]
  totalResolved: number
  /** null when totalResolved is 0 */
  brier: number | null
}

export interface CategoryStatRow {
  category: DecisionCategory
  count: number
  resolved: number
  hits: number
  /** null when resolved is 0 */
  hitRate: number | null
  /** mean stated confidence across all decisions in this category; null when count is 0 */
  meanConfidence: number | null
}

export interface ProcessOutcomePoint {
  id: string
  title: string
  processQuality: number
  outcomeQuality: number
}

export interface CadenceDay {
  /** YYYY-MM-DD in local time */
  date: string
  count: number
}

export interface AnalyticsSummary {
  totalDecisions: number
  totalResolved: number
  firstDecisionAt: number | null
}

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
  }
  decisions: {
    list(): Promise<Decision[]>
    create(input: CreateDecisionInput): Promise<Decision>
    review(input: ReviewDecisionInput): Promise<Decision>
  }
  analytics: {
    summary(): Promise<AnalyticsSummary>
    calibration(): Promise<CalibrationData>
    categoryStats(): Promise<CategoryStatRow[]>
    processOutcome(): Promise<ProcessOutcomePoint[]>
    cadence(days: number): Promise<CadenceDay[]>
  }
  theme: {
    get(): Promise<ThemeMode>
    set(mode: ThemeMode): Promise<void>
    onSystemChange(cb: (isDark: boolean) => void): () => void
  }
  app: {
    version(): Promise<string>
    platform(): Promise<string>
  }
}

declare global {
  interface Window {
    api: Api
  }
}
