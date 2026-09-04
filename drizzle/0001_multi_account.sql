-- v3.2 (ADR-002): X 連携を複数アカウント（最大 3）にする。
-- 既存データは最初の 1 件に帰属させる。

ALTER TABLE x_account ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE x_account ADD COLUMN last_sync_head_tweet_id TEXT;
ALTER TABLE x_account ADD COLUMN last_synced_at TEXT;

ALTER TABLE sources ADD COLUMN x_account_id TEXT REFERENCES x_account(id) ON DELETE SET NULL;
ALTER TABLE sync_runs ADD COLUMN x_account_id TEXT REFERENCES x_account(id) ON DELETE SET NULL;

-- 既存の単一カーソルを最初のアカウントへ移す
UPDATE x_account
SET last_sync_head_tweet_id = (SELECT last_sync_head_tweet_id FROM settings WHERE id = 1),
    last_synced_at = (SELECT last_synced_at FROM settings WHERE id = 1)
WHERE id = (SELECT id FROM x_account ORDER BY created_at ASC LIMIT 1);

UPDATE sources
SET x_account_id = (SELECT id FROM x_account ORDER BY created_at ASC LIMIT 1)
WHERE origin = 'x_bookmark' AND x_account_id IS NULL;

UPDATE sync_runs
SET x_account_id = (SELECT id FROM x_account ORDER BY created_at ASC LIMIT 1)
WHERE x_account_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sources_x_account ON sources(x_account_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_x_account ON sync_runs(x_account_id);
