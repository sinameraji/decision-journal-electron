import Database from 'better-sqlite3-multiple-ciphers'
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

type DB = Database.Database

const BASE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS decisions (
  id                      TEXT PRIMARY KEY,
  title                   TEXT NOT NULL,
  body                    TEXT NOT NULL DEFAULT '',
  created_at              INTEGER NOT NULL,
  review_at               INTEGER,
  is_sample               INTEGER NOT NULL DEFAULT 0,
  confidence              INTEGER,
  category                TEXT,
  stakes                  TEXT,
  predicted_outcome       TEXT,
  alternatives_considered TEXT,
  resolved_at             INTEGER,
  actual_outcome          TEXT,
  result                  TEXT,
  process_quality         INTEGER,
  outcome_quality         INTEGER,
  lessons                 TEXT
);
CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_resolved_at ON decisions(resolved_at);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

const DECISION_COLUMN_ADDITIONS: Array<[string, string]> = [
  ['confidence', 'INTEGER'],
  ['category', 'TEXT'],
  ['stakes', 'TEXT'],
  ['predicted_outcome', 'TEXT'],
  ['alternatives_considered', 'TEXT'],
  ['resolved_at', 'INTEGER'],
  ['actual_outcome', 'TEXT'],
  ['result', 'TEXT'],
  ['process_quality', 'INTEGER'],
  ['outcome_quality', 'INTEGER'],
  ['lessons', 'TEXT']
]

function runMigrations(db: DB): void {
  db.exec(BASE_SCHEMA_SQL)

  const existingCols = new Set(
    (db.prepare('PRAGMA table_info(decisions)').all() as Array<{ name: string }>).map(
      (r) => r.name
    )
  )
  for (const [name, type] of DECISION_COLUMN_ADDITIONS) {
    if (!existingCols.has(name)) {
      db.exec(`ALTER TABLE decisions ADD COLUMN ${name} ${type}`)
    }
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_decisions_resolved_at ON decisions(resolved_at)')
}

export async function openEncryptedDb(dbPath: string, masterKey: Buffer): Promise<DB> {
  await fs.mkdir(dirname(dbPath), { recursive: true })

  const db = new Database(dbPath)

  const hexKey = masterKey.toString('hex')
  db.pragma(`cipher='sqlcipher'`)
  db.pragma(`key="x'${hexKey}'"`)
  db.pragma(`cipher_page_size = 4096`)
  db.pragma(`kdf_iter = 256000`)
  db.pragma(`cipher_hmac_algorithm = HMAC_SHA512`)
  db.pragma(`cipher_kdf_algorithm = PBKDF2_HMAC_SHA512`)

  try {
    db.prepare('SELECT count(*) FROM sqlite_master').get()
  } catch (err) {
    db.close()
    throw new Error('Failed to open encrypted database: wrong key or corrupted file')
  }

  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)

  try {
    await fs.chmod(dbPath, 0o600)
  } catch {
    // best-effort; ignore on FS that doesn't support chmod
  }

  return db
}

export function closeDb(db: DB | null): void {
  if (db) {
    try {
      db.close()
    } catch {
      // ignore
    }
  }
}
