-- Cookie 未設定時に開く既定 X アカウント。未設定なら先頭アカウント。
-- 既存の個人ライブラリでは Deathisnotf1nal を初回既定にする。

ALTER TABLE settings ADD COLUMN default_x_account_id TEXT;

UPDATE settings
SET default_x_account_id = (
  SELECT id FROM x_account
  WHERE lower(x_username) = 'deathisnotf1nal'
  LIMIT 1
)
WHERE id = 1 AND default_x_account_id IS NULL;
