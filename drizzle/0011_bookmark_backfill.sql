-- 過去ブックマークの手動遡及。差分同期の head とは別に、古い方向のカーソルを持つ。

ALTER TABLE x_account ADD COLUMN backfill_pagination_token TEXT;
ALTER TABLE x_account ADD COLUMN backfill_exhausted INTEGER NOT NULL DEFAULT 0;
