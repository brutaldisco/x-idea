-- ADR-005: メディアのローカル保存 + 返信コンテキスト

ALTER TABLE media_assets ADD COLUMN local_path TEXT;
ALTER TABLE media_assets ADD COLUMN local_bytes INTEGER;
ALTER TABLE media_assets ADD COLUMN download_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE media_assets ADD COLUMN download_error TEXT;
ALTER TABLE media_assets ADD COLUMN downloaded_at TEXT;
ALTER TABLE media_assets ADD COLUMN variants_json TEXT;

ALTER TABLE x_posts ADD COLUMN reply_to_tweet_id TEXT;

ALTER TABLE settings ADD COLUMN reply_context_enabled INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_media_download ON media_assets (download_status);
CREATE INDEX IF NOT EXISTS idx_x_posts_reply_to ON x_posts (reply_to_tweet_id);
CREATE INDEX IF NOT EXISTS idx_x_posts_conversation ON x_posts (conversation_id);
