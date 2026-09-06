import { getClient } from "@/db/client";

export async function rememberDismissedBookmark(
  accountId: string,
  tweetId: string,
): Promise<void> {
  await getClient().execute({
    sql: `INSERT OR IGNORE INTO dismissed_bookmarks (x_account_id, tweet_id, created_at)
          VALUES (?, ?, datetime('now'))`,
    args: [accountId, tweetId],
  });
}

export async function isDismissedBookmark(
  accountId: string,
  tweetId: string,
): Promise<boolean> {
  const result = await getClient().execute({
    sql: `SELECT tweet_id FROM dismissed_bookmarks
          WHERE x_account_id = ? AND tweet_id = ?
          LIMIT 1`,
    args: [accountId, tweetId],
  });
  return Boolean(result.rows[0]);
}

export async function advanceSyncHeadIfNeeded(
  accountId: string,
  removedTweetId: string,
): Promise<void> {
  const client = getClient();
  const current = await client.execute({
    sql: `SELECT last_sync_head_tweet_id FROM x_account WHERE id = ? LIMIT 1`,
    args: [accountId],
  });
  if (
    String(current.rows[0]?.last_sync_head_tweet_id ?? "") !== removedTweetId
  ) {
    return;
  }
  const next = await client.execute({
    sql: `SELECT p.tweet_id AS tweet_id
          FROM sources s
          JOIN x_posts p ON p.id = s.x_post_id
          WHERE s.x_account_id = ? AND p.tweet_id IS NOT NULL
          ORDER BY COALESCE(s.bookmarked_at, s.saved_at) DESC
          LIMIT 1`,
    args: [accountId],
  });
  const nextId = next.rows[0]?.tweet_id ? String(next.rows[0].tweet_id) : null;
  await client.execute({
    sql: `UPDATE x_account
          SET last_sync_head_tweet_id = ?, updated_at = datetime('now')
          WHERE id = ?`,
    args: [nextId, accountId],
  });
}
