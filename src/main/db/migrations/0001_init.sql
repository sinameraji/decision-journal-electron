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
