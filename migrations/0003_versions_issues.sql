-- Chapter version history + persisted continuity-check issues.
-- Additive only: no existing table or row is altered, so applying this
-- migration to a live database is safe.

-- One row per saved snapshot of a chapter's text. Written before any
-- overwrite (generate / rewrite / manual edit / restore), so the previous
-- text can always be recovered.
CREATE TABLE IF NOT EXISTS chapter_versions (
  id          TEXT PRIMARY KEY,
  chapter_id  TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  number      INTEGER NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  summary     TEXT NOT NULL DEFAULT '',
  state       TEXT,                 -- JSON StoryState, as of this version
  word_count  INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'draft',
  reason      TEXT NOT NULL DEFAULT 'edit',  -- generate | rewrite | edit | restore-backup | cascade (never used: ledger-only changes do not snapshot)
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_versions_chapter ON chapter_versions(chapter_id, created_at DESC);

-- Continuity-check results, persisted so a check does not have to be
-- re-run (and re-paid for) after leaving the page.
CREATE TABLE IF NOT EXISTS chapter_issues (
  id          TEXT PRIMARY KEY,
  chapter_id  TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  number      INTEGER NOT NULL,
  severity    TEXT NOT NULL,        -- high | medium | low
  category    TEXT NOT NULL DEFAULT 'other',
  quote       TEXT NOT NULL DEFAULT '',
  problem     TEXT NOT NULL DEFAULT '',
  fix         TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'manual',  -- auto | manual
  fixed       INTEGER NOT NULL DEFAULT 0,
  checked_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_issues_chapter ON chapter_issues(chapter_id, checked_at DESC);
