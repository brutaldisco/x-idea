-- カテゴリと情報タイプを X アカウントごとに持つ。
-- 初期値は既存の seed カテゴリと既定の情報タイプをコピーする。

CREATE TABLE IF NOT EXISTS account_taxonomy (
  id TEXT PRIMARY KEY,
  x_account_id TEXT NOT NULL REFERENCES x_account(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('category', 'info_type')),
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (x_account_id, kind, item_id)
);

CREATE INDEX IF NOT EXISTS idx_account_taxonomy_account
  ON account_taxonomy (x_account_id, kind, sort_order);
