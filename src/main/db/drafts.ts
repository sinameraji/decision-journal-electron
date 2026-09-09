import type Database from 'better-sqlite3-multiple-ciphers'
import type { DecisionDraft, DecisionDraftInput } from '@shared/ipc-contract'

type DB = Database.Database

interface DraftRow {
  key: string
  form: string
  step: number
  base_updated_at: number | null
  created_at: number
  updated_at: number
}

/**
 * The draft of an unsaved decision.
 *
 * `key` is 'new' for the create form, or the decision's id when editing an
 * existing one, so the two never overwrite each other and an interrupted edit
 * does not resurface as a new entry.
 *
 * `baseUpdatedAt` records the decision's updated_at when an edit draft was
 * started. If the decision has moved on since — edited elsewhere, or restored
 * from a backup — the draft describes text that no longer exists and is
 * dropped rather than merged, which would silently revert the newer version.
 */
export function getDraft(db: DB, key: string): DecisionDraft | null {
  const row = db
    .prepare('SELECT * FROM decision_drafts WHERE key = ?')
    .get(key) as DraftRow | undefined
  if (!row) return null
  return {
    key: row.key,
    form: row.form,
    step: row.step,
    baseUpdatedAt: row.base_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function saveDraft(db: DB, input: DecisionDraftInput): void {
  const now = Date.now()
  db.prepare(
    `INSERT INTO decision_drafts (key, form, step, base_updated_at, created_at, updated_at)
     VALUES (@key, @form, @step, @baseUpdatedAt, @now, @now)
     ON CONFLICT(key) DO UPDATE SET
       form = excluded.form,
       step = excluded.step,
       base_updated_at = excluded.base_updated_at,
       updated_at = excluded.updated_at`
  ).run({
    key: input.key,
    form: input.form,
    step: input.step,
    baseUpdatedAt: input.baseUpdatedAt,
    now
  })
}

export function clearDraft(db: DB, key: string): void {
  db.prepare('DELETE FROM decision_drafts WHERE key = ?').run(key)
}
