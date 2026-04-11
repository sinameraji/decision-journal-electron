import type Database from 'better-sqlite3-multiple-ciphers'
import { randomUUID } from 'node:crypto'
import type {
  Decision,
  DecisionCreateInput,
  DecisionUpdateInput,
  MentalState
} from '@shared/ipc-contract'
import { MENTAL_STATES } from '@shared/ipc-contract'

type DB = Database.Database

interface DecisionRow {
  id: string
  title: string
  decided_at: number
  review_at: number | null
  mental_state: string
  situation: string
  problem_statement: string
  variables: string
  complications: string
  alternatives: string
  range_of_outcomes: string
  expected_outcome: string
  outcome: string
  lessons_learned: string
  reviewed_at: number | null
  created_at: number
  updated_at: number | null
  is_sample: number
}

function parseMentalState(raw: string): MentalState[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is MentalState =>
      typeof s === 'string' && (MENTAL_STATES as readonly string[]).includes(s)
    )
  } catch {
    return []
  }
}

function rowToDecision(row: DecisionRow): Decision {
  return {
    id: row.id,
    title: row.title,
    decidedAt: row.decided_at ?? row.created_at,
    reviewAt: row.review_at,
    mentalState: parseMentalState(row.mental_state),
    situation: row.situation ?? '',
    problemStatement: row.problem_statement ?? '',
    variables: row.variables ?? '',
    complications: row.complications ?? '',
    alternatives: row.alternatives ?? '',
    rangeOfOutcomes: row.range_of_outcomes ?? '',
    expectedOutcome: row.expected_outcome ?? '',
    outcome: row.outcome ?? '',
    lessonsLearned: row.lessons_learned ?? '',
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    isSample: row.is_sample ? 1 : 0
  }
}

const SELECT_ALL = `
  SELECT id, title, decided_at, review_at, mental_state, situation, problem_statement,
         variables, complications, alternatives, range_of_outcomes, expected_outcome,
         outcome, lessons_learned, reviewed_at, created_at, updated_at, is_sample
  FROM decisions
`

export function listDecisions(db: DB): Decision[] {
  const rows = db
    .prepare(`${SELECT_ALL} ORDER BY COALESCE(decided_at, created_at) DESC, created_at DESC`)
    .all() as DecisionRow[]
  return rows.map(rowToDecision)
}

export function getDecision(db: DB, id: string): Decision | null {
  const row = db.prepare(`${SELECT_ALL} WHERE id = ?`).get(id) as DecisionRow | undefined
  return row ? rowToDecision(row) : null
}

export function createDecision(db: DB, input: DecisionCreateInput, isSample = 0): Decision {
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO decisions (
       id, title, decided_at, review_at, mental_state, situation, problem_statement,
       variables, complications, alternatives, range_of_outcomes, expected_outcome,
       outcome, lessons_learned, reviewed_at, created_at, updated_at, is_sample, body
     ) VALUES (
       @id, @title, @decidedAt, @reviewAt, @mentalState, @situation, @problemStatement,
       @variables, @complications, @alternatives, @rangeOfOutcomes, @expectedOutcome,
       '', '', NULL, @createdAt, @updatedAt, @isSample, ''
     )`
  ).run({
    id,
    title: input.title,
    decidedAt: input.decidedAt,
    reviewAt: input.reviewAt,
    mentalState: JSON.stringify(input.mentalState ?? []),
    situation: input.situation ?? '',
    problemStatement: input.problemStatement ?? '',
    variables: input.variables ?? '',
    complications: input.complications ?? '',
    alternatives: input.alternatives ?? '',
    rangeOfOutcomes: input.rangeOfOutcomes ?? '',
    expectedOutcome: input.expectedOutcome ?? '',
    createdAt: now,
    updatedAt: now,
    isSample
  })
  const created = getDecision(db, id)
  if (!created) throw new Error('Failed to read back created decision')
  return created
}

const PATCH_COLUMNS: Record<keyof DecisionUpdateInput, string> = {
  title: 'title',
  decidedAt: 'decided_at',
  reviewAt: 'review_at',
  mentalState: 'mental_state',
  situation: 'situation',
  problemStatement: 'problem_statement',
  variables: 'variables',
  complications: 'complications',
  alternatives: 'alternatives',
  rangeOfOutcomes: 'range_of_outcomes',
  expectedOutcome: 'expected_outcome'
}

export function updateDecision(db: DB, id: string, patch: DecisionUpdateInput): Decision {
  const sets: string[] = []
  const values: Record<string, unknown> = { id, updatedAt: Date.now() }

  for (const key of Object.keys(patch) as Array<keyof DecisionUpdateInput>) {
    const col = PATCH_COLUMNS[key]
    if (!col) continue
    const value = patch[key]
    if (key === 'mentalState') {
      sets.push(`${col} = @${key}`)
      values[key] = JSON.stringify(value ?? [])
    } else {
      sets.push(`${col} = @${key}`)
      values[key] = value
    }
  }

  sets.push('updated_at = @updatedAt')

  db.prepare(`UPDATE decisions SET ${sets.join(', ')} WHERE id = @id`).run(values)

  const updated = getDecision(db, id)
  if (!updated) throw new Error('Decision not found after update')
  return updated
}

export function deleteDecision(db: DB, id: string): void {
  db.prepare('DELETE FROM decisions WHERE id = ?').run(id)
}

export function countDecisions(db: DB): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM decisions').get() as { c: number }
  return row.c
}

function buildMatchQuery(raw: string): string {
  const tokens = raw
    .replace(/["*():\-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0)
  if (tokens.length === 0) return ''
  return tokens.map((t) => `"${t}"*`).join(' ')
}

export function searchDecisions(db: DB, rawQuery: string): Decision[] {
  const q = buildMatchQuery(rawQuery)
  if (!q) return []
  const rows = db
    .prepare(
      `SELECT d.id, d.title, d.decided_at, d.review_at, d.mental_state, d.situation,
              d.problem_statement, d.variables, d.complications, d.alternatives,
              d.range_of_outcomes, d.expected_outcome, d.outcome, d.lessons_learned,
              d.reviewed_at, d.created_at, d.updated_at, d.is_sample
       FROM decisions d
       JOIN decisions_fts ON decisions_fts.rowid = d.rowid
       WHERE decisions_fts MATCH ?
       ORDER BY bm25(decisions_fts), COALESCE(d.decided_at, d.created_at) DESC
       LIMIT 200`
    )
    .all(q) as DecisionRow[]
  return rows.map(rowToDecision)
}
