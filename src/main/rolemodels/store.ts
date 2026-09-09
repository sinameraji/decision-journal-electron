/**
 * Encrypted storage for role models. Lives in the journal database, so it is
 * covered by the same key and the same backups.
 */

import type Database from 'better-sqlite3-multiple-ciphers'
import { randomUUID } from 'node:crypto'
import type {
  ClaimSection,
  RoleModelSource,
  SourceType,
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

function asSourceType(raw: string | null): SourceType {
  return raw === 'primary' ? 'primary' : 'secondary'
}

function claimsFor(db: DB, id: string): RoleModelClaim[] {
  const rows = db
    .prepare(
      `SELECT id, section, text, source_url, source_title, source_type
         FROM role_model_claims WHERE role_model_id = ?
        ORDER BY CASE source_type WHEN 'primary' THEN 0 ELSE 1 END, created_at ASC`
    )
    .all(id) as {
    id: string
    section: string
    text: string
    source_url: string
    source_title: string | null
    source_type: string | null
  }[]
  // Their own words first within each section.
  return rows
    .filter((r) => (CLAIM_SECTIONS as readonly string[]).includes(r.section))
    .map((r) => ({
      id: r.id,
      section: r.section as ClaimSection,
      text: r.text,
      sourceUrl: r.source_url,
      sourceTitle: r.source_title,
      sourceType: asSourceType(r.source_type)
    }))
}

function frameworksFor(db: DB, id: string): RoleModelFramework[] {
  const rows = db
    .prepare(
      `SELECT id, role_model_id, name, summary, instruction, source_url, source_title,
              source_type, enabled
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
    source_type: string | null
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
    sourceType: asSourceType(r.source_type),
    enabled: r.enabled === 1
  }))
}

function addedSourcesFor(db: DB, id: string): RoleModelSource[] {
  const rows = db
    .prepare(
      `SELECT id, role_model_id, url, title, status, claims_added, frameworks_added, error, created_at
         FROM role_model_added_sources WHERE role_model_id = ? ORDER BY created_at DESC`
    )
    .all(id) as {
    id: string
    role_model_id: string
    url: string
    title: string | null
    status: string
    claims_added: number
    frameworks_added: number
    error: string | null
    created_at: number
  }[]
  return rows.map((r) => ({
    id: r.id,
    roleModelId: r.role_model_id,
    url: r.url,
    title: r.title,
    status: r.status === 'added' || r.status === 'error' ? r.status : 'reading',
    claimsAdded: r.claims_added,
    frameworksAdded: r.frameworks_added,
    error: r.error,
    createdAt: r.created_at
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
    addedSources: addedSourcesFor(db, r.id),
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
           (id, role_model_id, section, text, source_url, source_title, source_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), id, c.section, c.text, c.sourceUrl, c.sourceTitle, c.sourceType, now)
    }
    for (const f of profile.frameworks) {
      db.prepare(
        `INSERT INTO role_model_frameworks
           (id, role_model_id, name, summary, instruction, source_url, source_title,
            source_type, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
      ).run(
        randomUUID(),
        id,
        f.name,
        f.summary,
        f.instruction,
        f.sourceUrl,
        f.sourceTitle,
        f.sourceType,
        now
      )
    }
    db.prepare(
      `UPDATE role_models SET summary = ?, sentiment = ?, status = 'ready',
                              last_error = NULL, updated_at = ? WHERE id = ?`
    ).run(profile.summary, profile.sentiment, now, id)
  })
  tx()
}

export function beginSource(db: DB, roleModelId: string, url: string): string {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO role_model_added_sources
       (id, role_model_id, url, status, claims_added, frameworks_added, created_at)
     VALUES (?, ?, ?, 'reading', 0, 0, ?)`
  ).run(id, roleModelId, url, Date.now())
  return id
}

export function failSource(db: DB, sourceId: string, error: string): void {
  db.prepare("UPDATE role_model_added_sources SET status = 'error', error = ? WHERE id = ?").run(
    error,
    sourceId
  )
}

export function sourceAlreadyAdded(db: DB, roleModelId: string, url: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM role_model_added_sources
        WHERE role_model_id = ? AND url = ? AND status = 'added' LIMIT 1`
    )
    .get(roleModelId, url)
  return row !== undefined
}

/**
 * Appends what one document contributed, rather than replacing the profile.
 *
 * A claim that merely restates something already recorded is dropped: the
 * point of adding a source is what it adds, and a profile that accumulates
 * paraphrases of itself gets worse as it grows.
 */
export function appendFromSource(
  db: DB,
  params: {
    roleModelId: string
    sourceId: string
    title: string | null
    claims: ValidatedClaim[]
    frameworks: ValidatedFramework[]
  }
): { claimsAdded: number; frameworksAdded: number } {
  const now = Date.now()
  let claimsAdded = 0
  let frameworksAdded = 0

  const norm = (t: string): string => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

  const tx = db.transaction(() => {
    const existingClaims = new Set(
      (
        db
          .prepare('SELECT text FROM role_model_claims WHERE role_model_id = ?')
          .all(params.roleModelId) as { text: string }[]
      ).map((r) => norm(r.text))
    )
    for (const c of params.claims) {
      if (existingClaims.has(norm(c.text))) continue
      existingClaims.add(norm(c.text))
      db.prepare(
        `INSERT INTO role_model_claims
           (id, role_model_id, section, text, source_url, source_title, source_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), params.roleModelId, c.section, c.text, c.sourceUrl, c.sourceTitle, c.sourceType, now)
      claimsAdded += 1
    }

    const existingFrameworks = new Set(
      (
        db
          .prepare('SELECT name FROM role_model_frameworks WHERE role_model_id = ?')
          .all(params.roleModelId) as { name: string }[]
      ).map((r) => norm(r.name))
    )
    for (const f of params.frameworks) {
      if (existingFrameworks.has(norm(f.name))) continue
      existingFrameworks.add(norm(f.name))
      db.prepare(
        `INSERT INTO role_model_frameworks
           (id, role_model_id, name, summary, instruction, source_url, source_title,
            source_type, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
      ).run(randomUUID(), params.roleModelId, f.name, f.summary, f.instruction, f.sourceUrl, f.sourceTitle, f.sourceType, now)
      frameworksAdded += 1
    }

    db.prepare(
      `UPDATE role_model_added_sources
          SET status = 'added', title = ?, claims_added = ?, frameworks_added = ?, error = NULL
        WHERE id = ?`
    ).run(params.title, claimsAdded, frameworksAdded, params.sourceId)
    db.prepare('UPDATE role_models SET updated_at = ? WHERE id = ?').run(now, params.roleModelId)
  })
  tx()
  return { claimsAdded, frameworksAdded }
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
              f.source_url, f.source_title, f.source_type, f.enabled, m.name AS person
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
    source_type: string | null
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
    sourceType: asSourceType(r.source_type),
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

/** Every enabled framework for one person, for the whole-toolkit frame. */
export function personFrameworks(
  db: DB,
  roleModelId: string
): { personName: string; frameworks: RoleModelFramework[] } | null {
  const all = enabledFrameworks(db).filter((f) => f.roleModelId === roleModelId)
  if (all.length === 0) return null
  return { personName: all[0].personName, frameworks: all }
}

export function count(db: DB): number {
  const row = db.prepare('SELECT COUNT(*) AS c FROM role_models').get() as { c: number }
  return row.c
}
