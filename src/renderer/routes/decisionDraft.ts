/**
 * The shape of the decision form while it is being written, and the rules for
 * putting it back together from a stored draft.
 *
 * Separate from the component so the parsing can be tested: it is the gate
 * between a draft that has gone bad and someone's unsaved writing, and it has
 * to fail by keeping as much as it can rather than by throwing.
 */

import {
  MENTAL_STATES,
  type DecisionOption,
  type MentalState
} from '@shared/ipc-contract'

export interface FormState {
  title: string
  decidedAtLocal: string // YYYY-MM-DDTHH:mm
  reviewAtLocal: string // YYYY-MM-DD
  reviewAtTouched: boolean
  mentalState: MentalState[]
  situation: string
  problemStatement: string
  variables: string
  complications: string
  options: DecisionOption[]
  migratedFromLegacy: boolean
  rangeOfOutcomes: string
  expectedOutcome: string
  memoryExcluded: boolean
}

export function makeBlankOption(chosen = false): DecisionOption {
  return { id: crypto.randomUUID(), name: '', note: '', chosen }
}

export const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 182

export const STEPS = [
  { index: 1, label: 'The decision' },
  { index: 2, label: 'The situation' },
  { index: 3, label: 'The analysis' },
  { index: 4, label: 'The options' }
] as const

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function toLocalDateTimeString(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

export function toLocalDateString(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromLocalDateTime(s: string): number {
  const ms = new Date(s).getTime()
  return Number.isFinite(ms) ? ms : Date.now()
}

export function fromLocalDate(s: string): number {
  const ms = new Date(`${s}T12:00`).getTime()
  return Number.isFinite(ms) ? ms : Date.now()
}

export function emptyForm(): FormState {
  const now = Date.now()
  return {
    title: '',
    decidedAtLocal: toLocalDateTimeString(now),
    reviewAtLocal: toLocalDateString(now + SIX_MONTHS_MS),
    reviewAtTouched: false,
    mentalState: [],
    situation: '',
    problemStatement: '',
    variables: '',
    complications: '',
    options: [makeBlankOption(), makeBlankOption()],
    migratedFromLegacy: false,
    rangeOfOutcomes: '',
    expectedOutcome: '',
    memoryExcluded: false
  }
}

/** How long typing has to pause before the draft is written. */
export const AUTOSAVE_DELAY_MS = 700

/**
 * Whether there is anything worth keeping.
 *
 * A blank form is still "dirty" the moment a minute ticks over, because the
 * default decided-at is the current time. Without this, opening the form and
 * walking away would leave a draft to be offered back later.
 */
export function hasContent(f: FormState): boolean {
  return (
    f.title.trim() !== '' ||
    f.situation.trim() !== '' ||
    f.problemStatement.trim() !== '' ||
    f.variables.trim() !== '' ||
    f.complications.trim() !== '' ||
    f.rangeOfOutcomes.trim() !== '' ||
    f.expectedOutcome.trim() !== '' ||
    f.mentalState.length > 0 ||
    f.options.some((o) => o.name.trim() !== '' || o.note.trim() !== '')
  )
}

function isMentalState(v: unknown): v is MentalState {
  return typeof v === 'string' && (MENTAL_STATES as readonly string[]).includes(v)
}

function toOption(v: unknown): DecisionOption | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Partial<DecisionOption>
  if (typeof o.name !== 'string' || typeof o.note !== 'string') return null
  return {
    id: typeof o.id === 'string' && o.id !== '' ? o.id : crypto.randomUUID(),
    name: o.name,
    note: o.note,
    chosen: o.chosen === true
  }
}

/**
 * Rebuilds a form from a stored draft.
 *
 * Merged over a blank form rather than trusted wholesale: a draft written by an
 * older build may be missing a field this one expects, and restoring most of
 * someone's writing beats discarding all of it over one absent key. Anything
 * unparseable returns null and the draft is dropped.
 */
export function parseDraft(raw: string): FormState | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Partial<FormState>
  const base = emptyForm()
  const options = Array.isArray(p.options)
    ? p.options.map(toOption).filter((o): o is DecisionOption => o !== null)
    : []

  return {
    ...base,
    ...p,
    mentalState: Array.isArray(p.mentalState) ? p.mentalState.filter(isMentalState) : [],
    options: options.length > 0 ? options : base.options
  }
}
