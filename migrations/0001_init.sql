-- Novel AI Global schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS books (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  platform         TEXT NOT NULL,           -- stary | webnovel | royalroad | wattpad
  language         TEXT NOT NULL DEFAULT 'en',
  genre            TEXT NOT NULL DEFAULT '',
  tropes           TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
  premise          TEXT NOT NULL DEFAULT '',
  pov              TEXT NOT NULL DEFAULT 'first',   -- first | third
  tense            TEXT NOT NULL DEFAULT 'past',    -- past | present
  heat_level       TEXT NOT NULL DEFAULT 'sweet',   -- clean | sweet | steamy
  words_per_chapter INTEGER NOT NULL DEFAULT 2000,
  target_chapters  INTEGER NOT NULL DEFAULT 100,
  style_notes      TEXT NOT NULL DEFAULT '',
  bible            TEXT,                    -- JSON story bible (characters, setting, outlines)
  auto_daily       INTEGER NOT NULL DEFAULT 0,  -- chapters to auto-generate per day via cron
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  id            TEXT PRIMARY KEY,
  book_id       TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL DEFAULT '',
  summary       TEXT NOT NULL DEFAULT '',
  word_count    INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'draft',  -- draft | ready | published
  published_url TEXT NOT NULL DEFAULT '',
  published_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (book_id, number)
);
CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, number);

CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  book_id     TEXT,
  type        TEXT NOT NULL,     -- bible | outline | chapter | rewrite | cron
  status      TEXT NOT NULL,     -- running | done | failed
  detail      TEXT NOT NULL DEFAULT '',
  error       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_book ON jobs(book_id, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
