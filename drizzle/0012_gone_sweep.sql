-- 保存済み Source の削除確認カーソル。同期ごとに最大 100 件を tweet lookup する。

ALTER TABLE x_account ADD COLUMN gone_sweep_cursor TEXT;
