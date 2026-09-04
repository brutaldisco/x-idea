import { getClient } from "@/db/client";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { hostOf, normalizeUrl } from "@/server/ingest/url";
import {
  type BookmarksPage,
  isReply,
  quotedTweetId,
  tweetText,
  tweetUrls,
  type XTweet,
} from "@/server/x/parse";

export type IngestResult =
  | { created: true }
  | { created: false; skipped: "exists" | "reply" };

export async function tweetExists(tweetId: string): Promise<boolean> {
  const result = await getClient().execute({
    sql: "SELECT 1 AS n FROM x_posts WHERE tweet_id = ? LIMIT 1",
    args: [tweetId],
  });
  return Boolean(result.rows[0]);
}

export async function markUnavailable(tweetId: string): Promise<void> {
  await getClient().execute({
    sql: `UPDATE sources SET availability = 'unavailable', updated_at = datetime('now')
          WHERE x_post_id = (SELECT id FROM x_posts WHERE tweet_id = ? LIMIT 1)`,
    args: [tweetId],
  });
}

async function upsertFts(sourceId: string, text: string): Promise<void> {
  try {
    await getClient().execute({
      sql: `INSERT INTO sources_fts (source_id, post_text, article_title, article_text, ai_summary, user_note, tags, media_text)
            VALUES (?, ?, '', '', '', '', '', '')`,
      args: [sourceId, text.slice(0, 4000)],
    });
  } catch (error) {
    logger.warn({ err: error }, "sources_fts upsert skipped");
  }
}

async function attachUrls(sourceId: string, urls: string[]): Promise<void> {
  const client = getClient();
  for (const raw of urls) {
    const normalized = normalizeUrl(raw);
    const existing = await client.execute({
      sql: "SELECT id FROM articles WHERE normalized_url = ? LIMIT 1",
      args: [normalized],
    });
    let articleId = existing.rows[0]?.id ? String(existing.rows[0].id) : null;
    if (!articleId) {
      articleId = newId();
      await client.execute({
        sql: `INSERT INTO articles (id, normalized_url, original_url, domain, fetch_scope, created_at)
              VALUES (?, ?, ?, ?, 'pending', datetime('now'))`,
        args: [articleId, normalized, raw, hostOf(raw)],
      });
    }
    await client.execute({
      sql: `INSERT OR IGNORE INTO source_articles (source_id, article_id, link_url)
            VALUES (?, ?, ?)`,
      args: [sourceId, articleId, raw],
    });
  }
}

export async function ingestBookmark(input: {
  accountId: string;
  tweet: XTweet;
  page: BookmarksPage;
  saveReplies: boolean;
}): Promise<IngestResult> {
  if (!input.saveReplies && isReply(input.tweet)) {
    return { created: false, skipped: "reply" };
  }
  if (await tweetExists(input.tweet.id)) {
    return { created: false, skipped: "exists" };
  }

  const author = input.tweet.author_id
    ? input.page.users.get(input.tweet.author_id)
    : undefined;
  const username = author?.username ?? "unknown";
  const text = tweetText(input.tweet);
  const quoted = quotedTweetId(input.tweet);
  const quotedTweet = quoted
    ? input.page.includedTweets.get(quoted)
    : undefined;
  const postId = newId();
  const sourceId = newId();
  const client = getClient();

  await client.execute({
    sql: `INSERT INTO x_posts (
      id, tweet_id, conversation_id, author_id, author_username, author_name,
      author_avatar_url, text, lang, posted_at, url, is_reply, quoted_tweet_id,
      quoted_snapshot_json, raw_entities_json, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      postId,
      input.tweet.id,
      input.tweet.conversation_id ?? input.tweet.id,
      input.tweet.author_id ?? "unknown",
      username,
      author?.name ?? null,
      author?.profile_image_url ?? null,
      text,
      input.tweet.lang ?? null,
      input.tweet.created_at ?? null,
      `https://x.com/${username}/status/${input.tweet.id}`,
      isReply(input.tweet) ? 1 : 0,
      quoted,
      quotedTweet ? JSON.stringify(quotedTweet) : null,
      input.tweet.entities ? JSON.stringify(input.tweet.entities) : null,
    ],
  });

  for (const key of (input.tweet.attachments?.media_keys ?? []).slice(0, 8)) {
    const media = input.page.media.get(key);
    if (!media) {
      continue;
    }
    await client.execute({
      sql: `INSERT INTO media_assets (
        id, x_post_id, media_key, type, preview_url, media_url, alt_text,
        duration_ms, width, height, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        newId(),
        postId,
        media.media_key,
        media.type,
        media.preview_image_url ?? null,
        media.url ?? null,
        media.alt_text ?? null,
        media.duration_ms ?? null,
        media.width ?? null,
        media.height ?? null,
      ],
    });
  }

  await client.execute({
    sql: `INSERT INTO sources (
      id, origin, kind, x_account_id, x_post_id, bookmarked_at, saved_at,
      availability, triage_status, read_status, language, created_at, updated_at
    ) VALUES (?, 'x_bookmark', 'x_post', ?, ?, ?, datetime('now'),
      'available', 'pending', 'unread', ?, datetime('now'), datetime('now'))`,
    args: [
      sourceId,
      input.accountId,
      postId,
      input.tweet.created_at ?? null,
      input.tweet.lang ?? null,
    ],
  });

  await attachUrls(sourceId, tweetUrls(input.tweet));
  await upsertFts(sourceId, text);
  return { created: true };
}
