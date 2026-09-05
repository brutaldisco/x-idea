-- 自動同期は最短 6 時間。既存の 30 分 cron を置き換える。

UPDATE settings SET sync_interval_min = 360 WHERE id = 1 AND sync_interval_min < 360;
UPDATE job_schedules
SET cron_expr = '0 */6 * * *', next_run_at = NULL
WHERE key = 'sync';
