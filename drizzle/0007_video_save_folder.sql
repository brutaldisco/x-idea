-- 動画保存フォルダ名。ハンドルはブラウザごと。名前だけ共有する。

ALTER TABLE settings ADD COLUMN video_save_folder_name TEXT;
