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
    // Provider metadata for conversations. Everything that existed before this
    // migration was an Ollama conversation, so that is the default; no existing
    // decision or message content is rewritten.
    version: 5,
    sql: `
      ALTER TABLE conversations ADD COLUMN provider       TEXT    NOT NULL DEFAULT 'ollama';
      ALTER TABLE conversations ADD COLUMN attachments    TEXT    NOT NULL DEFAULT '[]';
      ALTER TABLE conversations ADD COLUMN online_consent INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE chat_messages ADD COLUMN status   TEXT NOT NULL DEFAULT 'complete';
      ALTER TABLE chat_messages ADD COLUMN provider TEXT;
      ALTER TABLE chat_messages ADD COLUMN model_id TEXT;
      ALTER TABLE chat_messages ADD COLUMN seq      INTEGER NOT NULL DEFAULT 0;

      UPDATE chat_messages SET seq = (
        SELECT COUNT(*) FROM chat_messages m2
         WHERE m2.conversation_id = chat_messages.conversation_id
           AND (m2.created_at < chat_messages.created_at
                OR (m2.created_at = chat_messages.created_at AND m2.rowid <= chat_messages.rowid))
      );

      UPDATE chat_messages
         SET provider = 'ollama',
             model_id = (SELECT c.model_id FROM conversations c WHERE c.id = conversation_id)
       WHERE role = 'assistant';

      CREATE INDEX IF NOT EXISTS idx_chat_messages_seq
        ON chat_messages(conversation_id, seq ASC);
    `
  },
  {
    // Optional AI memory. Everything here lives inside the encrypted database
    // alongside the journal it was derived from.
    version: 6,
    sql: `
      -- Per-decision opt-out, honoured before a job is ever enqueued.
      ALTER TABLE decisions ADD COLUMN memory_excluded INTEGER NOT NULL DEFAULT 0;

      -- Enabling extraction does not authorize exporting the whole profile into
      -- every conversation, so this is per-conversation and defaults to off.
      ALTER TABLE conversations ADD COLUMN include_memories INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS memory_items (
        id              TEXT PRIMARY KEY,
        category        TEXT    NOT NULL,
        statement       TEXT    NOT NULL,
        kind            TEXT    NOT NULL,
        state           TEXT    NOT NULL,
        user_authored   INTEGER NOT NULL DEFAULT 0,
        applicable_date TEXT,
        domain          TEXT,
        model_id        TEXT,
        prompt_version  INTEGER,
        supersedes      TEXT,
        question        TEXT,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_items_state
        ON memory_items(state, updated_at DESC);

      -- A statement can be supported by more than one decision. Deleting a
      -- source removes its row; the item survives only if support remains.
      CREATE TABLE IF NOT EXISTS memory_sources (
        id          TEXT PRIMARY KEY,
        item_id     TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
        decision_id TEXT REFERENCES decisions(id) ON DELETE CASCADE,
        field       TEXT NOT NULL,
        excerpt     TEXT NOT NULL,
        revision    INTEGER NOT NULL,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_sources_item ON memory_sources(item_id);
      CREATE INDEX IF NOT EXISTS idx_memory_sources_decision ON memory_sources(decision_id);

      CREATE TABLE IF NOT EXISTS memory_jobs (
        id                 TEXT PRIMARY KEY,
        decision_id        TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
        content_revision   INTEGER NOT NULL,
        prompt_version     INTEGER NOT NULL,
        consent_generation INTEGER NOT NULL,
        state              TEXT NOT NULL,
        attempts           INTEGER NOT NULL DEFAULT 0,
        last_error         TEXT,
        created_at         INTEGER NOT NULL,
        updated_at         INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_jobs_state ON memory_jobs(state, created_at ASC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_jobs_pending
        ON memory_jobs(decision_id) WHERE state IN ('queued', 'running');

      -- A rejection is remembered so the same assertion is not re-proposed on
      -- every subsequent edit of the same decision.
      CREATE TABLE IF NOT EXISTS memory_suppressions (
        id         TEXT PRIMARY KEY,
        normalized TEXT NOT NULL,
        category   TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_suppressions_key
        ON memory_suppressions(category, normalized);
    `
  }
,
  {
    // A conversation remembers the lens it was started under, so reopening it
    // restores the frame rather than silently reverting to a generic coach.
    version: 7,
    sql: `ALTER TABLE conversations ADD COLUMN lens TEXT;`
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

  const target = MIGRATIONS[MIGRATIONS.length - 1].version
  console.log(`[db] schema_version=${current}, target=${target}`)

  const apply = db.transaction(() => {
    for (const m of MIGRATIONS) {
      if (m.version > current) {
        console.log(`[db] applying migration ${m.version}`)
        db.exec(m.sql)
        setVersion.run(String(m.version))
      }
    }
  })
  apply()

  ensureSchema(db)
  setVersion.run(String(target))
}

/** Columns every table must have for the current code to run. */
const REQUIRED_COLUMNS: { table: string; column: string; definition: string }[] = [
  // Migration 5
  { table: 'conversations', column: 'provider', definition: `TEXT NOT NULL DEFAULT 'ollama'` },
  { table: 'conversations', column: 'attachments', definition: `TEXT NOT NULL DEFAULT '[]'` },
  { table: 'conversations', column: 'online_consent', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'chat_messages', column: 'status', definition: `TEXT NOT NULL DEFAULT 'complete'` },
  { table: 'chat_messages', column: 'provider', definition: 'TEXT' },
  { table: 'chat_messages', column: 'model_id', definition: 'TEXT' },
  { table: 'chat_messages', column: 'seq', definition: 'INTEGER NOT NULL DEFAULT 0' },
  // Migration 6
  { table: 'decisions', column: 'memory_excluded', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'conversations', column: 'include_memories', definition: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'memory_items', column: 'question', definition: 'TEXT' },
  // Migration 7
  { table: 'conversations', column: 'lens', definition: 'TEXT' }
]

/** Tables the current code needs, with the SQL to recreate an absent one. */
const REQUIRED_TABLES: { name: string; sql: string }[] = [
  {
    name: 'memory_items',
    sql: `CREATE TABLE IF NOT EXISTS memory_items (
      id TEXT PRIMARY KEY, category TEXT NOT NULL, statement TEXT NOT NULL,
      kind TEXT NOT NULL, state TEXT NOT NULL, user_authored INTEGER NOT NULL DEFAULT 0,
      applicable_date TEXT, domain TEXT, model_id TEXT, prompt_version INTEGER,
      supersedes TEXT, question TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`
  },
  {
    name: 'memory_sources',
    sql: `CREATE TABLE IF NOT EXISTS memory_sources (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
      decision_id TEXT REFERENCES decisions(id) ON DELETE CASCADE,
      field TEXT NOT NULL, excerpt TEXT NOT NULL, revision INTEGER NOT NULL,
      created_at INTEGER NOT NULL)`
  },
  {
    name: 'memory_jobs',
    sql: `CREATE TABLE IF NOT EXISTS memory_jobs (
      id TEXT PRIMARY KEY,
      decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
      content_revision INTEGER NOT NULL, prompt_version INTEGER NOT NULL,
      consent_generation INTEGER NOT NULL, state TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`
  },
  {
    name: 'memory_suppressions',
    sql: `CREATE TABLE IF NOT EXISTS memory_suppressions (
      id TEXT PRIMARY KEY, normalized TEXT NOT NULL, category TEXT NOT NULL,
      created_at INTEGER NOT NULL)`
  }
]

function tableExists(db: DB, name: string): boolean {
  const row = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name)
  return row !== undefined
}

function columnNames(db: DB, table: string): Set<string> {
  if (!tableExists(db, table)) return new Set()
  return new Set((db.pragma(`table_info(${table})`) as { name: string }[]).map((c) => c.name))
}

/**
 * Brings the schema up to what the code requires, regardless of what
 * `schema_version` claims.
 *
 * A version stamp is a claim, not proof. A database stamped 6 while missing
 * migration 5 and 6's columns caused every `decisions:list` to fail with "no
 * such column", which the UI rendered as an empty journal — the most alarming
 * possible failure for this app. Deriving the work to do from the actual schema
 * removes the whole class of problem, and every statement here is a no-op on a
 * healthy database.
 */
export function ensureSchema(db: DB): void {
  const repaired: string[] = []

  for (const t of REQUIRED_TABLES) {
    if (!tableExists(db, t.name)) {
      db.exec(t.sql)
      repaired.push(`table ${t.name}`)
    }
  }

  for (const c of REQUIRED_COLUMNS) {
    if (!tableExists(db, c.table)) continue
    if (columnNames(db, c.table).has(c.column)) continue
    db.exec(`ALTER TABLE ${c.table} ADD COLUMN ${c.column} ${c.definition}`)
    repaired.push(`${c.table}.${c.column}`)
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_items_state ON memory_items(state, updated_at DESC)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_sources_item ON memory_sources(item_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_sources_decision ON memory_sources(decision_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_jobs_state ON memory_jobs(state, created_at ASC)`)
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_jobs_pending ON memory_jobs(decision_id) WHERE state IN ('queued','running')`
  )
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_suppressions_key ON memory_suppressions(category, normalized)`
  )
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_seq ON chat_messages(conversation_id, seq ASC)`)

  if (repaired.length > 0) {
    console.warn(`[db] schema was incomplete; added ${repaired.join(', ')}`)
  }
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
