/**
 * Encrypted storage for AI memory. Everything here lives in the journal
 * database, so it is covered by the same SQLCipher key and the same backups.
 */

import type Database from 'better-sqlite3-multiple-ciphers'
import { randomUUID } from 'node:crypto'
import type {
  MemoryCategory,
  MemoryItem,
  MemoryJob,
  MemoryJobState,
  MemoryKind,
  MemorySource,
  MemoryState
} from '@shared/memory'
import { isMemoryCategory, normalizeStatement } from '@shared/memory'

type DB = Database.Database

const META_ENABLED = 'memory_enabled'
const META_MODEL = 'memory_model'

// ---------------- Preferences ----------------

function readMeta(db: DB, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function writeMeta(db: DB, key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}

/** Off unless the user explicitly turned it on for this journal. */
export function isMemoryEnabled(db: DB): boolean {
  return readMeta(db, META_ENABLED) === '1'
}

export function setMemoryEnabled(db: DB, enabled: boolean): void {
  writeMeta(db, META_ENABLED, enabled ? '1' : '0')
}

export function getMemoryModel(db: DB, fallback: string): string {
  return readMeta(db, META_MODEL) ?? fallback
}

export function setMemoryModel(db: DB, modelId: string): void {
  writeMeta(db, META_MODEL, modelId)
}

// ---------------- Items ----------------

interface ItemRow {
  id: string
  category: string
  statement: string
  kind: string
  state: string
  user_authored: number
  applicable_date: string | null
  domain: string | null
  model_id: string | null
  prompt_version: number | null
  supersedes: string | null
  question: string | null
  created_at: number
  updated_at: number
}

interface SourceRow {
  item_id: string
  decision_id: string | null
  field: string
  excerpt: string
  revision: number
  title: string | null
}

function parseKind(raw: string): MemoryKind {
  return raw === 'explicit' || raw === 'self-described' ? raw : 'tentative'
}

function parseState(raw: string): MemoryState {
  return raw === 'approved' || raw === 'rejected' || raw === 'stale' ? raw : 'pending'
}

function loadSources(db: DB, itemIds: string[]): Map<string, MemorySource[]> {
  const out = new Map<string, MemorySource[]>()
  if (itemIds.length === 0) return out
  const placeholders = itemIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT s.item_id, s.decision_id, s.field, s.excerpt, s.revision, d.title
         FROM memory_sources s
         LEFT JOIN decisions d ON d.id = s.decision_id
        WHERE s.item_id IN (${placeholders})
        ORDER BY s.created_at ASC`
    )
    .all(...itemIds) as SourceRow[]
  for (const r of rows) {
    const list = out.get(r.item_id) ?? []
    list.push({
      decisionId: r.decision_id,
      decisionTitle: r.title,
      field: r.field,
      excerpt: r.excerpt,
      revision: r.revision
    })
    out.set(r.item_id, list)
  }
  return out
}

function rowsToItems(db: DB, rows: ItemRow[]): MemoryItem[] {
  const sources = loadSources(
    db,
    rows.map((r) => r.id)
  )
  return rows.map((r) => ({
    id: r.id,
    category: isMemoryCategory(r.category) ? r.category : 'identity',
    statement: r.statement,
    kind: parseKind(r.kind),
    state: parseState(r.state),
    userAuthored: r.user_authored === 1,
    sources: sources.get(r.id) ?? [],
    applicableDate: r.applicable_date,
    domain: r.domain,
    modelId: r.model_id,
    promptVersion: r.prompt_version,
    supersedes: r.supersedes,
    question: r.question,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))
}

const ITEM_COLUMNS = `id, category, statement, kind, state, user_authored, applicable_date,
                      domain, model_id, prompt_version, supersedes, question,
                      created_at, updated_at`

export function listItems(db: DB, states?: MemoryState[]): MemoryItem[] {
  if (!states || states.length === 0) {
    const rows = db
      .prepare(`SELECT ${ITEM_COLUMNS} FROM memory_items ORDER BY updated_at DESC`)
      .all() as ItemRow[]
    return rowsToItems(db, rows)
  }
  const placeholders = states.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT ${ITEM_COLUMNS} FROM memory_items
        WHERE state IN (${placeholders}) ORDER BY updated_at DESC`
    )
    .all(...states) as ItemRow[]
  return rowsToItems(db, rows)
}

export function getItem(db: DB, id: string): MemoryItem | null {
  const row = db.prepare(`SELECT ${ITEM_COLUMNS} FROM memory_items WHERE id = ?`).get(id) as
    | ItemRow
    | undefined
  if (!row) return null
  return rowsToItems(db, [row])[0]
}

export function countByState(db: DB, state: MemoryState): number {
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM memory_items WHERE state = ?')
    .get(state) as { c: number }
  return row.c
}

export interface ProposalInput {
  category: MemoryCategory
  statement: string
  kind: MemoryKind
  field: string
  excerpt: string
  applicableDate: string | null
  domain: string | null
  supersedesStatement: string | null
  /** Only set for tentative items; the question to put to the user. */
  question: string | null
}

/**
 * Where a proposal lands.
 *
 * An `explicit` item has already cleared the strongest check we have: the quote
 * it cites was verified verbatim against the user's own writing. Asking someone
 * to approve their own sentence back to them is theatre, and burying two
 * genuine uncertainties under thirty of them makes review worse, not safer. So
 * quoted fact goes straight to approved and stays fully editable, while a
 * `tentative` reading — the model's inference, which the user never wrote — is
 * the only thing that interrupts them.
 */
export function initialStateFor(kind: MemoryKind): MemoryState {
  return kind === 'tentative' ? 'pending' : 'approved'
}

/**
 * Inserts validated proposals as `pending`. If an equivalent statement already
 * exists, the new evidence is attached to it instead of creating a duplicate —
 * which also means a repeated edit of the same decision cannot masquerade as
 * independent support.
 */
export function insertProposals(
  db: DB,
  params: {
    decisionId: string
    revision: number
    modelId: string
    promptVersion: number
    proposals: ProposalInput[]
  }
): number {
  const now = Date.now()
  let inserted = 0

  const tx = db.transaction(() => {
    for (const p of params.proposals) {
      const existing = db
        .prepare(
          `SELECT id, state FROM memory_items
            WHERE category = ? AND lower(statement) = lower(?)
            LIMIT 1`
        )
        .get(p.category, p.statement) as { id: string; state: string } | undefined

      let itemId: string
      if (existing) {
        // Already known. Re-approving or re-proposing it is not new evidence,
        // but a genuinely different source is worth recording.
        itemId = existing.id
        const already = db
          .prepare(
            'SELECT 1 FROM memory_sources WHERE item_id = ? AND decision_id = ? LIMIT 1'
          )
          .get(itemId, params.decisionId)
        if (already) continue
      } else {
        itemId = randomUUID()
        const supersedes = p.supersedesStatement
          ? ((
              db
                .prepare(
                  'SELECT id FROM memory_items WHERE lower(statement) = lower(?) LIMIT 1'
                )
                .get(p.supersedesStatement) as { id: string } | undefined
            )?.id ?? null)
          : null

        db.prepare(
          `INSERT INTO memory_items
             (id, category, statement, kind, state, user_authored, applicable_date, domain,
              model_id, prompt_version, supersedes, question, created_at, updated_at)
           VALUES (@id, @category, @statement, @kind, @state, 0, @applicableDate, @domain,
                   @modelId, @promptVersion, @supersedes, @question, @now, @now)`
        ).run({
          id: itemId,
          category: p.category,
          statement: p.statement,
          kind: p.kind,
          state: initialStateFor(p.kind),
          applicableDate: p.applicableDate,
          domain: p.domain,
          modelId: params.modelId,
          promptVersion: params.promptVersion,
          supersedes,
          question: p.question,
          now
        })
        inserted += 1
      }

      db.prepare(
        `INSERT INTO memory_sources (id, item_id, decision_id, field, excerpt, revision, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), itemId, params.decisionId, p.field, p.excerpt, params.revision, now)
    }
  })
  tx()
  return inserted
}

export function setItemState(db: DB, id: string, state: MemoryState): void {
  db.prepare('UPDATE memory_items SET state = ?, updated_at = ? WHERE id = ?').run(
    state,
    Date.now(),
    id
  )
}

/**
 * The user's answer to an open question becomes the memory.
 *
 * They wrote it, so it stops being the model's tentative reading and becomes an
 * explicit, user-authored fact — approved immediately, with the question
 * cleared and the original source link intact.
 */
export function answerQuestion(db: DB, id: string, answer: string): void {
  db.prepare(
    `UPDATE memory_items
        SET statement = ?, kind = 'explicit', state = 'approved',
            user_authored = 1, question = NULL, updated_at = ?
      WHERE id = ?`
  ).run(answer, Date.now(), id)
}

export function updateStatement(db: DB, id: string, statement: string): void {
  db.prepare('UPDATE memory_items SET statement = ?, updated_at = ? WHERE id = ?').run(
    statement,
    Date.now(),
    id
  )
}

/**
 * Rejecting records a suppression rule so the same assertion is not proposed
 * again on the next edit of the same decision.
 */
export function rejectItem(db: DB, id: string): void {
  const item = getItem(db, id)
  if (!item) return
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM memory_items WHERE id = ?').run(id)
    db.prepare(
      `INSERT INTO memory_suppressions (id, normalized, category, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(category, normalized) DO NOTHING`
    ).run(randomUUID(), normalizeStatement(item.statement), item.category, Date.now())
  })
  tx()
}

export function deleteItem(db: DB, id: string): void {
  db.prepare('DELETE FROM memory_items WHERE id = ?').run(id)
}

export function isSuppressed(db: DB, category: string, statement: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM memory_suppressions WHERE category = ? AND normalized = ? LIMIT 1')
    .get(category, normalizeStatement(statement))
  return row !== undefined
}

export function addUserMemory(
  db: DB,
  params: { category: MemoryCategory; statement: string }
): MemoryItem {
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO memory_items
       (id, category, statement, kind, state, user_authored, applicable_date, domain,
        model_id, prompt_version, supersedes, question, created_at, updated_at)
     VALUES (?, ?, ?, 'explicit', 'approved', 1, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`
  ).run(id, params.category, params.statement, now, now)
  const created = getItem(db, id)
  if (!created) throw new Error('Failed to read back the new memory')
  return created
}

/**
 * Called when a decision's content changes. Items whose only support came from
 * the old revision are marked stale rather than silently kept: the text they
 * quoted may no longer exist.
 */
export function invalidateForDecision(db: DB, decisionId: string, newRevision: number): number {
  const rows = db
    .prepare(
      `SELECT DISTINCT i.id AS id
         FROM memory_items i
         JOIN memory_sources s ON s.item_id = i.id
        WHERE s.decision_id = ? AND s.revision < ? AND i.user_authored = 0`
    )
    .all(decisionId, newRevision) as { id: string }[]

  const tx = db.transaction(() => {
    for (const r of rows) {
      // Keep it if another, still-current source supports it.
      const other = db
        .prepare(
          `SELECT 1 FROM memory_sources
            WHERE item_id = ? AND NOT (decision_id = ? AND revision < ?)
            LIMIT 1`
        )
        .get(r.id, decisionId, newRevision)
      if (other) continue
      db.prepare("UPDATE memory_items SET state = 'stale', updated_at = ? WHERE id = ?").run(
        Date.now(),
        r.id
      )
    }
  })
  tx()
  return rows.length
}

/**
 * Called after a decision is deleted. Sources cascade away with the row; this
 * removes items that are left with no support at all.
 */
export function pruneOrphanedItems(db: DB): number {
  const result = db
    .prepare(
      `DELETE FROM memory_items
        WHERE user_authored = 0
          AND id NOT IN (SELECT item_id FROM memory_sources)`
    )
    .run()
  return result.changes
}

/**
 * Returns memory to the state a first-time user would see.
 *
 * This previously left `memory_suppressions` behind, so a rejection made months
 * ago silently kept its statement from ever being proposed again — the one
 * thing a user pressing "forget everything" would least expect to persist. The
 * job history goes too: it names decisions and is of no use once the memories
 * derived from it are gone.
 */
export function forgetAll(db: DB): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM memory_items').run()
    db.prepare('DELETE FROM memory_suppressions').run()
    db.prepare('DELETE FROM memory_jobs').run()
    setMemoryEnabled(db, false)
  })
  tx()
}

// ---------------- Jobs ----------------

interface JobRow {
  id: string
  decision_id: string
  content_revision: number
  prompt_version: number
  consent_generation: number
  state: string
  attempts: number
  last_error: string | null
  created_at: number
  updated_at: number
  title: string | null
}

function parseJobState(raw: string): MemoryJobState {
  return raw === 'running' || raw === 'done' || raw === 'error' || raw === 'cancelled'
    ? raw
    : 'queued'
}

const JOB_COLUMNS = `j.id, j.decision_id, j.content_revision, j.prompt_version,
                     j.consent_generation, j.state, j.attempts, j.last_error,
                     j.created_at, j.updated_at, d.title`

function rowToJob(row: JobRow): MemoryJob {
  return {
    id: row.id,
    decisionId: row.decision_id,
    decisionTitle: row.title,
    state: parseJobState(row.state),
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function enqueueJob(
  db: DB,
  params: {
    decisionId: string
    contentRevision: number
    promptVersion: number
    consentGeneration: number
  }
): string | null {
  const now = Date.now()
  // The partial unique index makes a second pending job for the same decision a
  // no-op, which is what debouncing rapid edits should do.
  const existing = db
    .prepare(
      "SELECT id FROM memory_jobs WHERE decision_id = ? AND state IN ('queued','running')"
    )
    .get(params.decisionId) as { id: string } | undefined
  if (existing) {
    db.prepare(
      'UPDATE memory_jobs SET content_revision = ?, updated_at = ? WHERE id = ?'
    ).run(params.contentRevision, now, existing.id)
    return existing.id
  }

  const id = randomUUID()
  db.prepare(
    `INSERT INTO memory_jobs
       (id, decision_id, content_revision, prompt_version, consent_generation,
        state, attempts, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'queued', 0, NULL, ?, ?)`
  ).run(
    id,
    params.decisionId,
    params.contentRevision,
    params.promptVersion,
    params.consentGeneration,
    now,
    now
  )
  return id
}

export interface ClaimedJob {
  id: string
  decisionId: string
  contentRevision: number
  promptVersion: number
  consentGeneration: number
  attempts: number
}

export function claimNextJob(db: DB): ClaimedJob | null {
  const row = db
    .prepare(
      `SELECT id, decision_id, content_revision, prompt_version, consent_generation, attempts
         FROM memory_jobs
        WHERE state = 'queued'
        ORDER BY created_at ASC
        LIMIT 1`
    )
    .get() as
    | {
        id: string
        decision_id: string
        content_revision: number
        prompt_version: number
        consent_generation: number
        attempts: number
      }
    | undefined
  if (!row) return null
  db.prepare(
    "UPDATE memory_jobs SET state = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ?"
  ).run(Date.now(), row.id)
  return {
    id: row.id,
    decisionId: row.decision_id,
    contentRevision: row.content_revision,
    promptVersion: row.prompt_version,
    consentGeneration: row.consent_generation,
    attempts: row.attempts + 1
  }
}

export function finishJob(db: DB, id: string, state: MemoryJobState, error?: string): void {
  db.prepare('UPDATE memory_jobs SET state = ?, last_error = ?, updated_at = ? WHERE id = ?').run(
    state,
    error ?? null,
    Date.now(),
    id
  )
}

export function requeueJob(db: DB, id: string, error: string): void {
  db.prepare(
    "UPDATE memory_jobs SET state = 'queued', last_error = ?, updated_at = ? WHERE id = ?"
  ).run(error, Date.now(), id)
}

export function cancelAllJobs(db: DB): void {
  db.prepare(
    "UPDATE memory_jobs SET state = 'cancelled', updated_at = ? WHERE state IN ('queued','running')"
  ).run(Date.now())
}

export function listJobs(db: DB, limit = 30): MemoryJob[] {
  const rows = db
    .prepare(
      `SELECT ${JOB_COLUMNS} FROM memory_jobs j
         LEFT JOIN decisions d ON d.id = j.decision_id
        ORDER BY j.created_at DESC LIMIT ?`
    )
    .all(limit) as JobRow[]
  return rows.map(rowToJob)
}

export function countQueuedJobs(db: DB): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM memory_jobs WHERE state IN ('queued','running')")
    .get() as { c: number }
  return row.c
}

// ---------------- Per-decision opt-out ----------------

export function isDecisionExcluded(db: DB, decisionId: string): boolean {
  const row = db
    .prepare('SELECT memory_excluded FROM decisions WHERE id = ?')
    .get(decisionId) as { memory_excluded: number } | undefined
  return row?.memory_excluded === 1
}

export function setDecisionExcluded(db: DB, decisionId: string, excluded: boolean): void {
  db.prepare('UPDATE decisions SET memory_excluded = ? WHERE id = ?').run(
    excluded ? 1 : 0,
    decisionId
  )
}
