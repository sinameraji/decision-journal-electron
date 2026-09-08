/**
 * Local validation of model-proposed memories.
 *
 * A JSON schema constrains the *shape* of the response; it says nothing about
 * whether the content is true. This is the part that checks the model actually
 * quoted the user: every proposal must carry an excerpt that appears verbatim
 * in the decision it claims to come from, and the field is taken from where the
 * excerpt was really found rather than from what the model asserted.
 */

import type { Decision } from '@shared/ipc-contract'
import { parseAlternatives } from '@shared/ipc-contract'
import { isMemoryCategory, type MemoryKind } from '@shared/memory'
import type { ProposalInput } from './store'

export const MAX_ITEMS_PER_DECISION = 12
export const MAX_STATEMENT_CHARS = 240
export const MIN_EXCERPT_CHARS = 8
export const MAX_EXCERPT_CHARS = 400

export type RejectionReason =
  | 'malformed'
  | 'unknown-category'
  | 'unknown-kind'
  | 'statement-too-long'
  | 'empty-statement'
  | 'excerpt-too-short'
  | 'excerpt-not-found'
  | 'suppressed'
  | 'over-limit'

export interface ValidationResult {
  accepted: ProposalInput[]
  rejected: { statement: string; reason: RejectionReason }[]
}

/** Field label → text, as the user wrote it. */
export function decisionFields(d: Decision): Record<string, string> {
  const parsed = parseAlternatives(d.alternatives)
  const optionsText =
    parsed.kind === 'structured'
      ? parsed.options.map((o) => `${o.name} ${o.note}`).join(' \n ')
      : parsed.kind === 'legacy'
        ? parsed.text
        : ''

  return {
    title: d.title,
    situation: d.situation,
    'problem statement': d.problemStatement,
    variables: d.variables,
    complications: d.complications,
    options: optionsText,
    'range of outcomes': d.rangeOfOutcomes,
    'expected outcome': d.expectedOutcome,
    outcome: d.outcome,
    'lessons learned': d.lessonsLearned
  }
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
}

/**
 * Finds which field the excerpt actually came from. Returns null when it is not
 * present anywhere in the entry, which is the signal that the model invented it.
 */
export function locateExcerpt(fields: Record<string, string>, excerpt: string): string | null {
  const needle = normalizeForMatch(excerpt)
  if (!needle) return null
  for (const [field, value] of Object.entries(fields)) {
    if (!value) continue
    if (normalizeForMatch(value).includes(needle)) return field
  }
  return null
}

interface RawItem {
  category?: unknown
  statement?: unknown
  kind?: unknown
  field?: unknown
  excerpt?: unknown
  applicableDate?: unknown
  domain?: unknown
  supersedesStatement?: unknown
}

function optionalString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

export function validateProposals(
  raw: unknown,
  decision: Decision,
  isSuppressed: (category: string, statement: string) => boolean
): ValidationResult {
  const accepted: ProposalInput[] = []
  const rejected: ValidationResult['rejected'] = []

  const items =
    raw != null && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)
      ? ((raw as { items: unknown[] }).items as RawItem[])
      : null

  if (!items) {
    return { accepted, rejected: [{ statement: '', reason: 'malformed' }] }
  }

  const fields = decisionFields(decision)
  const seen = new Set<string>()

  for (const item of items) {
    if (item == null || typeof item !== 'object') {
      rejected.push({ statement: '', reason: 'malformed' })
      continue
    }

    const statement = typeof item.statement === 'string' ? item.statement.trim() : ''
    if (!statement) {
      rejected.push({ statement: '', reason: 'empty-statement' })
      continue
    }
    if (statement.length > MAX_STATEMENT_CHARS) {
      rejected.push({ statement, reason: 'statement-too-long' })
      continue
    }
    if (!isMemoryCategory(item.category)) {
      rejected.push({ statement, reason: 'unknown-category' })
      continue
    }
    const kind = item.kind
    if (kind !== 'explicit' && kind !== 'self-described' && kind !== 'tentative') {
      rejected.push({ statement, reason: 'unknown-kind' })
      continue
    }

    const excerpt = typeof item.excerpt === 'string' ? item.excerpt.trim() : ''
    if (excerpt.length < MIN_EXCERPT_CHARS) {
      rejected.push({ statement, reason: 'excerpt-too-short' })
      continue
    }
    const field = locateExcerpt(fields, excerpt)
    if (!field) {
      rejected.push({ statement, reason: 'excerpt-not-found' })
      continue
    }

    if (isSuppressed(item.category, statement)) {
      rejected.push({ statement, reason: 'suppressed' })
      continue
    }

    const dedupeKey = `${item.category}::${statement.toLowerCase()}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    if (accepted.length >= MAX_ITEMS_PER_DECISION) {
      rejected.push({ statement, reason: 'over-limit' })
      continue
    }

    accepted.push({
      category: item.category,
      statement,
      kind: kind as MemoryKind,
      field,
      excerpt: excerpt.slice(0, MAX_EXCERPT_CHARS),
      applicableDate: normalizeDate(item.applicableDate),
      domain: optionalString(item.domain, 60),
      supersedesStatement: optionalString(item.supersedesStatement, MAX_STATEMENT_CHARS)
    })
  }

  return { accepted, rejected }
}

/** Accepts an ISO date only. A stated age is never converted into a date. */
function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) return null
  return trimmed
}
