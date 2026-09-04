-- Settings の使用量メーター（推定残量 + X Usage API キャッシュ）

ALTER TABLE settings ADD COLUMN x_usage_cache_json TEXT;

CREATE TABLE IF NOT EXISTS x_credit_ledger (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('topup', 'snapshot')),
  amount_usd REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_x_credit_ledger_created ON x_credit_ledger (created_at DESC);
