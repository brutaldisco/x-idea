-- 取得数のコントロール（負荷対策）

ALTER TABLE settings ADD COLUMN sync_max_per_run INTEGER NOT NULL DEFAULT 100;
ALTER TABLE settings ADD COLUMN media_download_per_tick INTEGER NOT NULL DEFAULT 5;
