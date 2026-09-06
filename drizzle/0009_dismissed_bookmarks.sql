-- アプリで削除したブックマークを同期で再取り込みしない。
-- X 側のブックマーク解除に失敗しても、この表があれば再取得しない。

CREATE TABLE IF NOT EXISTS dismissed_bookmarks (
  x_account_id TEXT NOT NULL REFERENCES x_account(id) ON DELETE CASCADE,
  tweet_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (x_account_id, tweet_id)
);

CREATE INDEX IF NOT EXISTS idx_dismissed_bookmarks_tweet
  ON dismissed_bookmarks (tweet_id);
