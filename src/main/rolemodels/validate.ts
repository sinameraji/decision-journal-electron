/**
 * Local validation of role-model lookups.
 *
 * The schema makes a citation structurally required; this enforces it anyway,
 * because a schema constrains shape and not honesty. Anything asserting
 * something about a real person without a usable source URL is dropped rather
 * than shown.
 */

import type { ClaimSection, RoleModelCandidate } from '@shared/roleModels'
import { CLAIM_SECTIONS, MAX_CANDIDATES } from '@shared/roleModels'

export const MAX_CLAIMS_PER_SECTION = 6
export const MAX_FRAMEWORKS = 5
const MAX_TEXT = 600
const MAX_NAME = 120

/** Only http(s) URLs are citations; anything else is not checkable. */
export function isUsableSource(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  if (!t) return null
  return t.slice(0, max)
}

export function validateCandidates(raw: unknown): RoleModelCandidate[] {
  const list =
    raw != null && typeof raw === 'object' && Array.isArray((raw as { candidates?: unknown }).candidates)
      ? ((raw as { candidates: unknown[] }).candidates as Record<string, unknown>[])
      : []

  const out: RoleModelCandidate[] = []
  const seen = new Set<string>()
  for (const c of list) {
    if (c == null || typeof c !== 'object') continue
    const name = str(c.name, MAX_NAME)
    const distinguisher = str(c.distinguisher, 240)
    if (!name || !distinguisher) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      name,
      distinguisher,
      lifespan: str(c.lifespan, 60),
      sourceUrl: isUsableSource(c.sourceUrl) ? c.sourceUrl : null
    })
    if (out.length >= MAX_CANDIDATES) break
  }
  return out
}

export interface ValidatedClaim {
  section: ClaimSection
  text: string
  sourceUrl: string
  sourceTitle: string | null
}

export interface ValidatedFramework {
  name: string
  summary: string
  instruction: string
  sourceUrl: string | null
  sourceTitle: string | null
}

export interface ValidatedProfile {
  summary: string | null
  sentiment: string | null
  claims: ValidatedClaim[]
  frameworks: ValidatedFramework[]
  /** Claims dropped for want of a source, so the UI can be honest about it. */
  droppedForNoSource: number
}

export function validateProfile(raw: unknown): ValidatedProfile {
  const obj = (raw ?? {}) as Record<string, unknown>
  const claims: ValidatedClaim[] = []
  const perSection = new Map<ClaimSection, number>()
  let dropped = 0

  for (const c of Array.isArray(obj.claims) ? (obj.claims as Record<string, unknown>[]) : []) {
    if (c == null || typeof c !== 'object') continue
    const section = c.section
    if (typeof section !== 'string' || !(CLAIM_SECTIONS as readonly string[]).includes(section)) {
      continue
    }
    const text = str(c.text, MAX_TEXT)
    if (!text) continue
    // The rule that matters: no citation, no claim.
    if (!isUsableSource(c.sourceUrl)) {
      dropped += 1
      continue
    }
    const s = section as ClaimSection
    const used = perSection.get(s) ?? 0
    if (used >= MAX_CLAIMS_PER_SECTION) continue
    perSection.set(s, used + 1)
    claims.push({
      section: s,
      text,
      sourceUrl: c.sourceUrl,
      sourceTitle: str(c.sourceTitle, 160)
    })
  }

  const frameworks: ValidatedFramework[] = []
  for (const f of Array.isArray(obj.frameworks) ? (obj.frameworks as Record<string, unknown>[]) : []) {
    if (f == null || typeof f !== 'object') continue
    const name = str(f.name, MAX_NAME)
    const summary = str(f.summary, 240)
    const instruction = str(f.instruction, 2000)
    if (!name || !summary || !instruction) continue
    frameworks.push({
      name,
      summary,
      instruction,
      sourceUrl: isUsableSource(f.sourceUrl) ? f.sourceUrl : null,
      sourceTitle: str(f.sourceTitle, 160)
    })
    if (frameworks.length >= MAX_FRAMEWORKS) break
  }

  return {
    summary: str(obj.summary, 1200),
    sentiment: str(obj.sentiment, 1200),
    claims,
    frameworks,
    droppedForNoSource: dropped
  }
}
