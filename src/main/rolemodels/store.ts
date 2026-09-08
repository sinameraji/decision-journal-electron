/**
 * Encrypted storage for role models. Lives in the journal database, so it is
 * covered by the same key and the same backups.
 */

import type Database from 'better-sqlite3-multiple-ciphers'
import { randomUUID } from 'node:crypto'
import type {
  ClaimSection,
  RoleModel,
  RoleModelCandidate,
  RoleModelClaim,
  RoleModelFramework,
  RoleModelStatus
} from '@shared/roleModels'
import { CLAIM_SECTIONS } from '@shared/roleModels'
import type { ValidatedClaim, ValidatedFramework } from './validate'

type DB = Database.Database

const META_ENABLED = 'role_models_enabled'
const META_MODEL = 'role_models_model'

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

export function isEnabled(db: DB): boolean {
  return readMeta(db, META_ENABLED) === '1'
}

export function setEnabled(db: DB, enabled: boolean): void {
  writeMeta(db, META_ENABLED, enabled ? '1' : '0')
}

export function getModel(db: DB, fallback: string): string {
  return readMeta(db, META_MODEL) ?? fallback
}

export function setModel(db: DB, modelId: string): void {
  writeMeta(db, META_MODEL, modelId)
}

interface Row {
  id: string
  query: string
  name: string | null
  distinguisher: string | null
  lifespan: string | null
  status: string
  summary: string | null
  sentiment: string | null
  candidates: string
  rounds: number
  last_error: string | null
  created_at: number
  updated_at: number
}

const STATUSES: RoleModelStatus[] = [
  'identifying',
  'awaiting-confirmation',
  'building',
  'ready',
  'error'
]

function parseStatus(raw: string): RoleModelStatus {
  return (STATUSES as string[]).includes(raw) ? (raw as RoleModelStatus) : 'error'
}

function parseCandidates(raw: string): RoleModelCandidate[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RoleModelCandidate[]) : []
  } catch {
    return []
  }
}

function claimsFor(db: DB, id: string): RoleModelClaim[] {
  const rows = db
    .prepare(
      `SELECT id, section, text, source_url, source_title
         FROM role_model_claims WHERE role_model_id = ? ORDER BY created_at ASC`
    )
    .all(id) as { id: string; section: string; text: string; source_url: string; source_title: string | null }[]
  return rows
    .filter((r) => (CLAIM_SECTIONS as readonly string[]).includes(r.section))
    .map((r) => ({
      id: r.id,
      section: r.section as ClaimSection,
      text: r.text,
      sourceUrl: r.source_url,
      sourceTitle: r.source_title
    }))
}

function frameworksFor(db: DB, id: string): RoleModelFramework[] {
  const rows = db
    .prepare(
      `SELECT id, role_model_id, name, summary, instruction, source_url, source_title, enabled
         FROM role_model_frameworks WHERE role_model_id = ? ORDER BY created_at ASC`
    )
    .all(id) as {
    id: string
    role_model_id: string
    name: string
    summary: string
    instruction: string
    source_url: string | null
    source_title: string | null
    enabled: number
  }[]
  return rows.map((r) => ({
    id: r.id,
    roleModelId: r.role_model_id,
    name: r.name,
    summary: r.summary,
    instruction: r.instruction,
    sourceUrl: r.source_url,
    sourceTitle: r.source_title,
    enabled: r.enabled === 1
  }))
}

function rowToModel(db: DB, r: Row): RoleModel {
  return {
    id: r.id,
    query: r.query,
    name: r.name,
    distinguisher: r.distinguisher,
    lifespan: r.lifespan,
    status: parseStatus(r.status),
    summary: r.summary,
    sentiment: r.sentiment,
    claims: claimsFor(db, r.id),
    frameworks: frameworksFor(db, r.id),
    candidates: parseCandidates(r.candidates),
    rounds: r.rounds,
    lastError: r.last_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

const COLUMNS = `id, query, name, distinguisher, lifespan, status, summary, sentiment,
                 candidates, rounds, last_error, created_at, updated_at`

export function list(db: DB): RoleModel[] {
  const rows = db.prepare(`SELECT ${COLUMNS} FROM role_models ORDER BY created_at ASC`).all() as Row[]
  return rows.map((r) => rowToModel(db, r))
}

export function get(db: DB, id: string): RoleModel | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM role_models WHERE id = ?`).get(id) as Row | undefined
  return row ? rowToModel(db, row) : null
}

export function create(db: DB, query: string): RoleModel {
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO role_models (id, query, status, candidates, rounds, created_at, updated_at)
     VALUES (?, ?, 'identifying', '[]', 0, ?, ?)`
  ).run(id, query, now, now)
  const created = get(db, id)
  if (!created) throw new Error('Failed to read back the new role model')
  return created
}

export function setCandidates(db: DB, id: string, candidates: RoleModelCandidate[]): void {
  db.prepare(
    `UPDATE role_models
        SET candidates = ?, status = 'awaiting-confirmation', rounds = rounds + 1,
            last_error = NULL, updated_at = ?
      WHERE id = ?`
  ).run(JSON.stringify(candidates), Date.now(), id)
}

export function setStatus(db: DB, id: string, status: RoleModelStatus, error?: string): void {
  db.prepare('UPDATE role_models SET status = ?, last_error = ?, updated_at = ? WHERE id = ?').run(
    status,
    error ?? null,
    Date.now(),
    id
  )
}

export function confirmIdentity(db: DB, id: string, c: RoleModelCandidate): void {
  db.prepare(
    `UPDATE role_models
        SET name = ?, distinguisher = ?, lifespan = ?, status = 'building',
            candidates = '[]', last_error = NULL, updated_at = ?
      WHERE id = ?`
  ).run(c.name, c.distinguisher, c.lifespan, Date.now(), id)
}

export function saveProfile(
  db: DB,
  id: string,
  profile: {
    summary: string | null
    sentiment: string | null
    claims: ValidatedClaim[]
    frameworks: ValidatedFramework[]
  }
): void {
  const now = Date.now()
  const tx = db.transaction(() => {
    // Rebuilding replaces the previous profile wholesale rather than merging,
    // so a stale claim can never outlive the sources that supported it.
    db.prepare('DELETE FROM role_model_claims WHERE role_model_id = ?').run(id)
    db.prepare('DELETE FROM role_model_frameworks WHERE role_model_id = ?').run(id)

    for (const c of profile.claims) {
      db.prepare(
        `INSERT INTO role_model_claims
           (id, role_model_id, section, text, source_url, source_title, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), id, c.section, c.text, c.sourceUrl, c.sourceTitle, now)
    }
    for (const f of profile.frameworks) {
      db.prepare(
        `INSERT INTO role_model_frameworks
           (id, role_model_id, name, summary, instruction, source_url, source_title, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
      ).run(randomUUID(), id, f.name, f.summary, f.instruction, f.sourceUrl, f.sourceTitle, now)
    }
    db.prepare(
      `UPDATE role_models SET summary = ?, sentiment = ?, status = 'ready',
                              last_error = NULL, updated_at = ? WHERE id = ?`
    ).run(profile.summary, profile.sentiment, now, id)
  })
  tx()
}

export function remove(db: DB, id: string): void {
  db.prepare('DELETE FROM role_models WHERE id = ?').run(id)
}

export function setFrameworkEnabled(db: DB, frameworkId: string, enabled: boolean): void {
  db.prepare('UPDATE role_model_frameworks SET enabled = ? WHERE id = ?').run(
    enabled ? 1 : 0,
    frameworkId
  )
}

/** Frameworks offered in the chat lens picker, with the person they came from. */
export function enabledFrameworks(
  db: DB
): (RoleModelFramework & { personName: string })[] {
  const rows = db
    .prepare(
      `SELECT f.id, f.role_model_id, f.name, f.summary, f.instruction,
              f.source_url, f.source_title, f.enabled, m.name AS person
         FROM role_model_frameworks f
         JOIN role_models m ON m.id = f.role_model_id
        WHERE f.enabled = 1 AND m.status = 'ready' AND m.name IS NOT NULL
        ORDER BY m.created_at ASC, f.created_at ASC`
    )
    .all() as {
    id: string
    role_model_id: string
    name: string
    summary: string
    instruction: string
    source_url: string | null
    source_title: string | null
    enabled: number
    person: string
  }[]
  return rows.map((r) => ({
    id: r.id,
    roleModelId: r.role_model_id,
    name: r.name,
    summary: r.summary,
    instruction: r.instruction,
    sourceUrl: r.source_url,
    sourceTitle: r.source_title,
    enabled: true,
    personName: r.person
  }))
}

export function getFramework(
  db: DB,
  frameworkId: string
): (RoleModelFramework & { personName: string }) | null {
  return enabledFrameworks(db).find((f) => f.id === frameworkId) ?? null
}

/**
 * True only if this exact URL is stored as a citation.
 *
 * Profile URLs come from a model, so they are not trusted input. Rather than
 * widening the app's external-link allowlist to "any https URL", a link may be
 * opened only if it is already recorded against a claim, a framework, or a
 * candidate currently being offered.
 */
export function isStoredSource(db: DB, url: string): boolean {
  const claim = db
    .prepare('SELECT 1 FROM role_model_claims WHERE source_url = ? LIMIT 1')
    .get(url)
  if (claim) return true
  const framework = db
    .prepare('SELECT 1 FROM role_model_frameworks WHERE source_url = ? LIMIT 1')
    .get(url)
  if (framework) return true
  const rows = db.prepare('SELECT candidates FROM role_models').all() as { candidates: string }[]
  for (const r of rows) {
    for (const c of parseCandidates(r.candidates)) {
      if (c.sourceUrl === url) return true
    }
  }
  return false
}

export function count(db: DB): number {
  const row = db.prepare('SELECT COUNT(*) AS c FROM role_models').get() as { c: number }
  return row.c
}
