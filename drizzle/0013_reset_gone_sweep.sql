-- 欠けた ID を削除扱いに変えたので、保存済みの確認を最初からやり直す。

UPDATE x_account SET gone_sweep_cursor = NULL, updated_at = datetime('now');
