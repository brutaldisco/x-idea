-- 動画保存フォルダ名を表示中の X アカウントごとに持つ。
-- 既存の settings.video_save_folder_name は初回だけ全アカウントへコピーする。

ALTER TABLE x_account ADD COLUMN video_save_folder_name TEXT;

UPDATE x_account
SET video_save_folder_name = (
  SELECT video_save_folder_name FROM settings WHERE id = 1
)
WHERE video_save_folder_name IS NULL;
