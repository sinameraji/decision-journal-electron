import Database from 'better-sqlite3-multiple-ciphers'
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

type DB = Database.Database

interface Migration {
  version: number
  sql: string
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS decisions (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL,
        body       TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        review_at  INTEGER,
        is_sample  INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at DESC);

      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `
  },
  {
    version: 2,
    sql: `
      ALTER TABLE decisions ADD COLUMN decided_at         INTEGER;
      ALTER TABLE decisions ADD COLUMN mental_state       TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE decisions ADD COLUMN situation          TEXT NOT NULL DEFAULT '';
      ALTER TABLE decisions ADD COLUMN problem_statement  TEXT NOT NULL DEFAULT '';
      ALTER TABLE decisions ADD COLUMN variables          TEXT NOT NULL DEFAULT '';
      ALTER TABLE decisions ADD COLUMN complications      TEXT NOT NULL DEFAULT '';
      ALTER TABLE decisions ADD COLUMN alternatives       TEXT NOT NULL DEFAULT '';
      ALTER TABLE decisions ADD COLUMN range_of_outcomes  TEXT NOT NULL DEFAULT '';
      ALTER TABLE decisions ADD COLUMN expected_outcome   TEXT NOT NULL DEFAULT '';
      ALTER TABLE decisions ADD COLUMN outcome            TEXT NOT NULL DEFAULT '';
      ALTER TABLE decisions ADD COLUMN lessons_learned    TEXT NOT NULL DEFAULT '';
      ALTER TABLE decisions ADD COLUMN reviewed_at        INTEGER;
      ALTER TABLE decisions ADD COLUMN updated_at         INTEGER;

      UPDATE decisions SET decided_at = created_at WHERE decided_at IS NULL;
      UPDATE decisions SET updated_at = created_at WHERE updated_at IS NULL;
    `
  },
  {
    version: 3,
    sql: `
      CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts USING fts5(
        title,
        situation,
        problem_statement,
        variables,
        complications,
        alternatives,
        range_of_outcomes,
        expected_outcome,
        outcome,
        lessons_learned,
        content='decisions',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2'
      );

      CREATE TRIGGER IF NOT EXISTS decisions_ai AFTER INSERT ON decisions BEGIN
        INSERT INTO decisions_fts(rowid, title, situation, problem_statement, variables,
          complications, alternatives, range_of_outcomes, expected_outcome, outcome, lessons_learned)
        VALUES (new.rowid, new.title, new.situation, new.problem_statement, new.variables,
          new.complications, new.alternatives, new.range_of_outcomes, new.expected_outcome,
          new.outcome, new.lessons_learned);
      END;

      CREATE TRIGGER IF NOT EXISTS decisions_ad AFTER DELETE ON decisions BEGIN
        INSERT INTO decisions_fts(decisions_fts, rowid, title, situation, problem_statement,
          variables, complications, alternatives, range_of_outcomes, expected_outcome, outcome, lessons_learned)
        VALUES('delete', old.rowid, old.title, old.situation, old.problem_statement, old.variables,
          old.complications, old.alternatives, old.range_of_outcomes, old.expected_outcome,
          old.outcome, old.lessons_learned);
      END;

      CREATE TRIGGER IF NOT EXISTS decisions_au AFTER UPDATE ON decisions BEGIN
        INSERT INTO decisions_fts(decisions_fts, rowid, title, situation, problem_statement,
          variables, complications, alternatives, range_of_outcomes, expected_outcome, outcome, lessons_learned)
        VALUES('delete', old.rowid, old.title, old.situation, old.problem_statement, old.variables,
          old.complications, old.alternatives, old.range_of_outcomes, old.expected_outcome,
          old.outcome, old.lessons_learned);
        INSERT INTO decisions_fts(rowid, title, situation, problem_statement, variables,
          complications, alternatives, range_of_outcomes, expected_outcome, outcome, lessons_learned)
        VALUES (new.rowid, new.title, new.situation, new.problem_statement, new.variables,
          new.complications, new.alternatives, new.range_of_outcomes, new.expected_outcome,
          new.outcome, new.lessons_learned);
      END;

      INSERT INTO decisions_fts(rowid, title, situation, problem_statement, variables,
        complications, alternatives, range_of_outcomes, expected_outcome, outcome, lessons_learned)
      SELECT rowid, title, situation, problem_statement, variables,
        complications, alternatives, range_of_outcomes, expected_outcome, outcome, lessons_learned
      FROM decisions;
    `
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS conversations (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL,
        model_id   TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role            TEXT NOT NULL,
        content         TEXT NOT NULL,
        created_at      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
        ON chat_messages(conversation_id, created_at ASC);
    `
  },
  {
    version: 5,
    sql: `
      CREATE TABLE IF NOT EXISTS decision_lenses (
        id          TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
        kind        TEXT NOT NULL,
        content     TEXT NOT NULL,
        model_id    TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_decision_lenses_decision
        ON decision_lenses(decision_id, created_at DESC);
    `
  },
  {
    version: 6,
    sql: `
      DROP INDEX IF EXISTS idx_decision_lenses_decision;
      DROP TABLE IF EXISTS decision_lenses;
    `
  }
]

function runMigrations(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`)

  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined
  const current = row ? parseInt(row.value, 10) : 0

  const setVersion = db.prepare(
    `INSERT INTO meta(key, value) VALUES('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )

  const apply = db.transaction(() => {
    for (const m of MIGRATIONS) {
      if (m.version > current) {
        db.exec(m.sql)
        setVersion.run(String(m.version))
      }
    }
  })
  apply()
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
  } catch {
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
