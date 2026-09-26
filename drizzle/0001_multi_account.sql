-- v3.2 (ADR-002): X 連携を複数アカウント（最大 3）にする。
-- 既存データは最初の 1 件に帰属させる。

ALTER TABLE x_account ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE x_account ADD COLUMN last_sync_head_tweet_id TEXT;
ALTER TABLE x_account ADD COLUMN last_synced_at TEXT;

ALTER TABLE sources ADD COLUMN x_account_id TEXT REFERENCES x_account(id) ON DELETE SET NULL;
ALTER TABLE sync_runs ADD COLUMN x_account_id TEXT REFERENCES x_account(id) ON DELETE SET NULL;

-- 既存の単一カーソルを最初のアカウントへ移す UPDATE は一度だけ流した。
-- applyMigration は起動のたびに全 SQL を再実行するため、ここへ UPDATE を
-- 置くと先頭アカウントの last_sync_head_tweet_id / last_synced_at が
-- settings の旧値（NULL）で毎回上書きされ、initial 同期に戻り続ける。
-- 再実行しない（0013_reset_gone_sweep.sql と同じ理由）。

UPDATE sources
SET x_account_id = (SELECT id FROM x_account ORDER BY created_at ASC LIMIT 1)
WHERE origin = 'x_bookmark' AND x_account_id IS NULL;

UPDATE sync_runs
SET x_account_id = (SELECT id FROM x_account ORDER BY created_at ASC LIMIT 1)
WHERE x_account_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sources_x_account ON sources(x_account_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_x_account ON sync_runs(x_account_id);
