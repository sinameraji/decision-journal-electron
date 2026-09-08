/**
 * Types for optional AI memory.
 *
 * Memory is a second, separately authorized online feature: enabling online
 * chat does not enable extraction, because extraction sends decision content
 * automatically after a save rather than only when the user presses send.
 *
 * The design deliberately stores *checkable* things — what the user stated,
 * chose, committed to, and learned — and refuses to infer demographics,
 * diagnoses, wealth, or personality traits.
 */

export const MEMORY_CATEGORIES = [
  'identity',
  'goal',
  'value',
  'constraint',
  'hope-or-fear',
  'option',
  'uncertainty',
  'time-horizon',
  'action',
  'lesson',
  'pattern',
  'coaching-preference'
] as const

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number]

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  identity: 'Relevant identity',
  goal: 'Goal or mission',
  value: 'Value or tradeoff',
  constraint: 'Resource or constraint',
  'hope-or-fear': 'Hope or fear',
  option: 'Option considered',
  uncertainty: 'Uncertainty',
  'time-horizon': 'Time horizon',
  action: 'Action or commitment',
  lesson: 'Lesson',
  pattern: 'Pattern across decisions',
  'coaching-preference': 'Coaching preference'
}

export function isMemoryCategory(value: unknown): value is MemoryCategory {
  return (
    typeof value === 'string' && (MEMORY_CATEGORIES as readonly string[]).includes(value)
  )
}

/**
 * How well supported a statement is. Deliberately an evidence label rather than
 * an uncalibrated percentage — the model has no basis for a confidence number.
 */
export type MemoryKind = 'explicit' | 'self-described' | 'tentative'

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  explicit: 'Stated outright',
  'self-described': 'The user’s description of themselves',
  tentative: 'Tentative observation'
}

export type MemoryState = 'pending' | 'approved' | 'rejected' | 'stale'

export interface MemorySource {
  decisionId: string | null
  decisionTitle: string | null
  /** Which journal field the excerpt came from. */
  field: string
  /** Short verbatim excerpt supporting the statement. */
  excerpt: string
  /** The decision's updatedAt when this was extracted, for invalidation. */
  revision: number
}

export interface MemoryItem {
  id: string
  category: MemoryCategory
  statement: string
  kind: MemoryKind
  state: MemoryState
  /** Written by the user rather than proposed by a model. */
  userAuthored: boolean
  sources: MemorySource[]
  /** ISO date the statement is true as of, when the journal said so. */
  applicableDate: string | null
  /** Free-text domain ("career", "money") to keep observations narrow. */
  domain: string | null
  /** Model and prompt that proposed it. Null for user-authored items. */
  modelId: string | null
  promptVersion: number | null
  /** Item this one replaces, if it supersedes an earlier statement. */
  supersedes: string | null
  createdAt: number
  updatedAt: number
}

export type MemoryJobState = 'queued' | 'running' | 'done' | 'error' | 'cancelled'

export interface MemoryJob {
  id: string
  decisionId: string
  decisionTitle: string | null
  state: MemoryJobState
  attempts: number
  lastError: string | null
  createdAt: number
  updatedAt: number
}

export interface MemorySettings {
  /** Extraction is off until explicitly enabled, separately from chat. */
  enabled: boolean
  /** Model used for extraction. Fixed at activation, not "whatever chat uses". */
  modelId: string
  /** Approved memories to offer as chat context. */
  approvedCount: number
  pendingCount: number
  queuedCount: number
  /** True when online AI itself is off, which pauses everything. */
  blockedByOnlineDisabled: boolean
}

export interface MemoryBackfillEstimate {
  decisionCount: number
  approxTokens: number
  estimatedCostUsd: number | null
}

export type MemoryActionResult = { ok: true } | { ok: false; error: string }

/** Statement normalisation used for suppression matching after a rejection. */
export function normalizeStatement(statement: string): string {
  return statement
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
