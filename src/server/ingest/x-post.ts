import { getClient } from "@/db/client";
import { newId } from "@/lib/ids";
import { enqueueJob } from "@/server/jobs/queue";
import { downloadUrlFor, initialDownloadStatus } from "@/server/media/select";
import {
  type BookmarksPage,
  isReply,
  quotedTweetId,
  replyToTweetId,
  tweetText,
  type XTweet,
} from "@/server/x/parse";

export async function findPostIdByTweetId(
  tweetId: string,
): Promise<string | null> {
  const result = await getClient().execute({
    sql: "SELECT id FROM x_posts WHERE tweet_id = ? LIMIT 1",
    args: [tweetId],
  });
  return result.rows[0]?.id ? String(result.rows[0].id) : null;
}

export async function upsertXPost(input: {
  tweet: XTweet;
  page: BookmarksPage;
  threadRootId?: string | null;
  threadIndex?: number | null;
}): Promise<{ postId: string; created: boolean }> {
  const existing = await findPostIdByTweetId(input.tweet.id);
  if (existing) {
    return { postId: existing, created: false };
  }

  const author = input.tweet.author_id
    ? input.page.users.get(input.tweet.author_id)
    : undefined;
  const username = author?.username ?? "unknown";
  const quoted = quotedTweetId(input.tweet);
  const quotedTweet = quoted
    ? input.page.includedTweets.get(quoted)
    : undefined;
  const postId = newId();

  await getClient().execute({
    sql: `INSERT INTO x_posts (
      id, tweet_id, conversation_id, thread_root_id, thread_index,
      author_id, author_username, author_name, author_avatar_url,
      text, lang, posted_at, url, is_reply, reply_to_tweet_id, quoted_tweet_id,
      quoted_snapshot_json, raw_entities_json, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      postId,
      input.tweet.id,
      input.tweet.conversation_id ?? input.tweet.id,
      input.threadRootId ?? null,
      input.threadIndex ?? null,
      input.tweet.author_id ?? "unknown",
      username,
      author?.name ?? null,
      author?.profile_image_url ?? null,
      tweetText(input.tweet),
      input.tweet.lang ?? null,
      input.tweet.created_at ?? null,
      `https://x.com/${username}/status/${input.tweet.id}`,
      isReply(input.tweet) ? 1 : 0,
      replyToTweetId(input.tweet),
      quoted,
      quotedTweet ? JSON.stringify(quotedTweet) : null,
      input.tweet.entities ? JSON.stringify(input.tweet.entities) : null,
    ],
  });
  return { postId, created: true };
}

export async function attachMedia(input: {
  postId: string;
  tweet: XTweet;
  page: BookmarksPage;
  accountId: string;
}): Promise<string[]> {
  const mediaIds: string[] = [];
  for (const key of (input.tweet.attachments?.media_keys ?? []).slice(0, 8)) {
    const media = input.page.media.get(key);
    if (!media) {
      continue;
    }
    const exists = await getClient().execute({
      sql: "SELECT id FROM media_assets WHERE x_post_id = ? AND media_key = ? LIMIT 1",
      args: [input.postId, media.media_key],
    });
    if (exists.rows[0]) {
      const existingId = String(exists.rows[0].id);
      const bestUrl = downloadUrlFor({
        type: media.type,
        media_url: media.url,
        variants: media.variants,
      });
      if (bestUrl || media.variants || media.url || media.preview_image_url) {
        await getClient().execute({
          sql: `UPDATE media_assets SET
            media_url = COALESCE(?, media_url),
            preview_url = COALESCE(?, preview_url),
            variants_json = COALESCE(?, variants_json),
            duration_ms = COALESCE(?, duration_ms),
            width = COALESCE(?, width),
            height = COALESCE(?, height),
            alt_text = COALESCE(?, alt_text),
            download_status = CASE
              WHEN download_status = 'failed' AND ? IS NOT NULL THEN 'pending'
              ELSE download_status
            END
            WHERE id = ?`,
          args: [
            bestUrl ?? media.url ?? null,
            media.preview_image_url ?? null,
            media.variants ? JSON.stringify(media.variants) : null,
            media.duration_ms ?? null,
            media.width ?? null,
            media.height ?? null,
            media.alt_text ?? null,
            bestUrl ?? media.url ?? null,
            existingId,
          ],
        });
      }
      mediaIds.push(existingId);
      continue;
    }
    const id = newId();
    const bestUrl = downloadUrlFor({
      type: media.type,
      media_url: media.url,
      variants: media.variants,
    });
    await getClient().execute({
      sql: `INSERT INTO media_assets (
        id, x_post_id, media_key, type, preview_url, media_url, alt_text,
        duration_ms, width, height, variants_json, download_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        id,
        input.postId,
        media.media_key,
        media.type,
        media.preview_image_url ?? null,
        bestUrl ?? media.url ?? null,
        media.alt_text ?? null,
        media.duration_ms ?? null,
        media.width ?? null,
        media.height ?? null,
        media.variants ? JSON.stringify(media.variants) : null,
        initialDownloadStatus(media),
      ],
    });
    mediaIds.push(id);
  }
  return mediaIds;
}

export async function enqueueMediaDownloads(
  mediaIds: string[],
  accountId: string,
): Promise<void> {
  if (mediaIds.length === 0) {
    return;
  }
  const client = getClient();
  for (const mediaId of mediaIds) {
    const row = await client.execute({
      sql: "SELECT download_status FROM media_assets WHERE id = ? LIMIT 1",
      args: [mediaId],
    });
    const status = String(row.rows[0]?.download_status ?? "");
    if (status !== "pending" && status !== "failed") {
      continue;
    }
    await enqueueJob({
      type: "media_download",
      payload: { media_id: mediaId, account_id: accountId },
      dedupeKey: `media_download:${mediaId}`,
      timeoutSec: 1800,
    });
  }
}
