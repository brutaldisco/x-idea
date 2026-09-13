CREATE TABLE IF NOT EXISTS chrome_translations (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_lang TEXT NOT NULL DEFAULT 'ja',
  source_hash TEXT NOT NULL,
  source_lang TEXT,
  text TEXT NOT NULL,
  translated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (target_kind, target_id, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_chrome_translations_target
  ON chrome_translations (target_kind, target_id);
