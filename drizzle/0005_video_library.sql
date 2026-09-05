-- ADR-007: 画像・サムネイルは DB、動画は手動キュー

CREATE TABLE IF NOT EXISTS media_blobs (
  media_id TEXT PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL DEFAULT 'image/webp',
  data BLOB NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS video_folders (
  id TEXT PRIMARY KEY,
  x_account_id TEXT NOT NULL REFERENCES x_account(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (x_account_id, name)
);

CREATE TABLE IF NOT EXISTS video_downloads (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL UNIQUE REFERENCES media_assets(id) ON DELETE CASCADE,
  x_account_id TEXT NOT NULL,
  folder_id TEXT REFERENCES video_folders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  rel_path TEXT,
  bytes INTEGER,
  error TEXT,
  queued_at TEXT NOT NULL DEFAULT (datetime('now')),
  downloaded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_video_downloads_status ON video_downloads (status, queued_at);
CREATE INDEX IF NOT EXISTS idx_video_downloads_account ON video_downloads (x_account_id, status);
