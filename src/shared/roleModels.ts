/**
 * Types for optional role models.
 *
 * A role model is a public figure the user nominates by name. The app looks
 * them up with a web-backed search, confirms it found the right person, then
 * builds a sourced profile and a set of decision-making frameworks that can be
 * applied in chat alongside the built-in lenses.
 *
 * Two rules shape everything here. Nothing about a real person is stored
 * without a citation, and the lookup loop is bounded — a confirmation flow that
 * can keep guessing forever is a worse failure than one that gives up and asks.
 */

/** Hard ceiling on "is this the right person?" rounds before we ask for help. */
export const MAX_DISAMBIGUATION_ROUNDS = 3

/** Candidates offered per round. */
export const MAX_CANDIDATES = 4

export type RoleModelStatus =
  | 'identifying'
  | 'awaiting-confirmation'
  | 'building'
  | 'ready'
  | 'error'

/** One person the lookup thinks the user might have meant. */
export interface RoleModelCandidate {
  /** Full name as commonly written. */
  name: string
  /** One line: what makes this person distinct from the others offered. */
  distinguisher: string
  /** Lifespan or active era, e.g. "b. 1964" or "1930–2010". Null when unclear. */
  lifespan: string | null
  /** Where this identification came from. */
  sourceUrl: string | null
}

/**
 * Which part of the profile a claim belongs to. Everything a role model
 * "is" lives in these sections, one sourced statement at a time.
 */
export const CLAIM_SECTIONS = [
  'known-for',
  'decision',
  'risk',
  'trait',
  'admirable',
  'caution'
] as const

export type ClaimSection = (typeof CLAIM_SECTIONS)[number]

export const CLAIM_SECTION_LABELS: Record<ClaimSection, string> = {
  'known-for': 'Known for',
  decision: 'Consequential decisions',
  risk: 'Risks taken, and what they cost',
  trait: 'Traits',
  admirable: 'Worth borrowing',
  caution: 'Where copying them would hurt you'
}

export const CLAIM_SECTION_BLURBS: Record<ClaimSection, string> = {
  'known-for': 'What this person is publicly known for.',
  decision: 'Consequential choices they made, and what happened.',
  risk: 'Risks they took and the reported cost — money, reputation, relationships.',
  trait: 'Traits attributed to them in public reporting.',
  admirable: 'What is genuinely worth learning from.',
  caution:
    'Where imitating them would be a mistake — survivorship bias, unusual circumstances, or conduct worth not copying.'
}

/** A single sourced statement. No claim is stored without a citation. */
export interface RoleModelClaim {
  id: string
  section: ClaimSection
  text: string
  sourceUrl: string
  sourceTitle: string | null
}

/**
 * A decision-making framework attributed to this person. Shown in the chat
 * lens picker beside the built-in ones, marked as borrowed so it is always
 * clear whose thinking is being applied.
 */
export interface RoleModelFramework {
  id: string
  roleModelId: string
  name: string
  /** One line, for the picker. */
  summary: string
  /** The instruction appended to the coach's system prompt. */
  instruction: string
  sourceUrl: string | null
  sourceTitle: string | null
  /** Off hides it from the picker without deleting it. */
  enabled: boolean
}

/** A framework as offered in the chat picker, with whose it is. */
export interface BorrowedFramework extends RoleModelFramework {
  personName: string
}

export interface RoleModel {
  id: string
  /** What the user typed. */
  query: string
  /** Canonical name, once confirmed. */
  name: string | null
  distinguisher: string | null
  lifespan: string | null
  status: RoleModelStatus
  /** One-paragraph summary of who they are. */
  summary: string | null
  /** How this person is generally regarded, with the range of views. */
  sentiment: string | null
  claims: RoleModelClaim[]
  frameworks: RoleModelFramework[]
  /** Candidates awaiting the user's confirmation. */
  candidates: RoleModelCandidate[]
  /** Rounds of disambiguation used so far, against MAX_DISAMBIGUATION_ROUNDS. */
  rounds: number
  lastError: string | null
  createdAt: number
  updatedAt: number
}

export interface RoleModelSettings {
  enabled: boolean
  /** Model used for lookup and profile building. */
  modelId: string
  count: number
  /** True when online AI is off, which blocks everything here. */
  blockedByOnlineDisabled: boolean
}

export type RoleModelResult = { ok: true } | { ok: false; error: string }

/**
 * Initials for the avatar. No photographs: showing one would mean allowing
 * arbitrary remote image hosts through the network gate, which is a large
 * concession for a small gain.
 */
export function initialsFor(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Stable colour per person, so the same face keeps the same badge. */
export function avatarHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

/** Opener used when a borrowed frame is run with an empty composer. */
export function borrowedOpener(personName: string, frameworkName: string): string {
  return `Analyse this decision the way ${personName} would, using ${frameworkName}.`
}
