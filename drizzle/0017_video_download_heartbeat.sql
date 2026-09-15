-- ダウンロード中の生存確認（ハートビート）と停止位置の記録（ADR-025）。
-- last_progress_at が新しい downloading は「別タブで実行中」とみなして
-- 再開を拒否し、古いものは中断として自動再開の対象にする。
-- progress_bytes / progress_total は停止時点の位置の記録（調査用のログ）。

ALTER TABLE video_downloads ADD COLUMN last_progress_at TEXT;
ALTER TABLE video_downloads ADD COLUMN progress_bytes INTEGER;
ALTER TABLE video_downloads ADD COLUMN progress_total INTEGER;
