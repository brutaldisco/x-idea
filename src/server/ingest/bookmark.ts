import { getClient } from "@/db/client";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import {
  attachArticleLinks,
  attachNativeXArticle,
} from "@/server/fetch/attach";
import {
  attachMedia,
  enqueueMediaDownloads,
  findPostIdByTweetId,
  upsertXPost,
} from "@/server/ingest/x-post";
import { enqueueEnrichBatch } from "@/server/jobs/enrich";
import { enqueueJob } from "@/server/jobs/queue";
import { getContextSettings } from "@/server/settings";
import { isDismissedBookmark } from "@/server/sources/dismiss";
import {
  type BookmarksPage,
  isReply,
  replyToTweetId,
  tweetText,
  tweetUrlEntries,
  type XTweet,
} from "@/server/x/parse";

export type IngestResult =
  | { created: true; sourceId: string; postId: string }
  | { created: false; skipped: "exists" | "reply" | "dismissed" };

export async function tweetExists(tweetId: string): Promise<boolean> {
  return Boolean(await findPostIdByTweetId(tweetId));
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

async function enqueueContextJobs(input: {
  accountId: string;
  tweet: XTweet;
  page: BookmarksPage;
  sourceId: string;
}): Promise<void> {
  const parentId = replyToTweetId(input.tweet);
  const includedParent = parentId
    ? input.page.includedTweets.get(parentId)
    : undefined;
  if (includedParent) {
    const parent = await upsertXPost({
      tweet: includedParent,
      page: input.page,
    });
    const mediaIds = await attachMedia({
      postId: parent.postId,
      tweet: includedParent,
      page: input.page,
      accountId: input.accountId,
    });
    await enqueueMediaDownloads(mediaIds, input.accountId);
  } else if (parentId) {
    await enqueueJob({
      type: "fetch_parent",
      payload: {
        tweet_id: parentId,
        account_id: input.accountId,
        source_id: input.sourceId,
      },
      dedupeKey: `fetch_parent:${parentId}`,
    });
  }

  const settings = await getContextSettings();
  if (settings.replyContextEnabled) {
    await enqueueJob({
      type: "reply_context",
      payload: {
        conversation_id: input.tweet.conversation_id ?? input.tweet.id,
        account_id: input.accountId,
        source_id: input.sourceId,
      },
      dedupeKey: `reply_context:${input.tweet.conversation_id ?? input.tweet.id}`,
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
  if (await isDismissedBookmark(input.accountId, input.tweet.id)) {
    return { created: false, skipped: "dismissed" };
  }

  const existingSource = await getClient().execute({
    sql: `SELECT s.id, s.x_post_id FROM sources s
          JOIN x_posts p ON p.id = s.x_post_id
          WHERE p.tweet_id = ? LIMIT 1`,
    args: [input.tweet.id],
  });
  if (existingSource.rows[0]) {
    await attachNativeXArticle(
      String(existingSource.rows[0].id),
      input.tweet,
      existingSource.rows[0].x_post_id
        ? String(existingSource.rows[0].x_post_id)
        : undefined,
    );
    return { created: false, skipped: "exists" };
  }

  const { postId } = await upsertXPost({
    tweet: input.tweet,
    page: input.page,
  });
  const mediaIds = await attachMedia({
    postId,
    tweet: input.tweet,
    page: input.page,
    accountId: input.accountId,
  });
  await enqueueMediaDownloads(mediaIds, input.accountId);

  const sourceId = newId();
  await getClient().execute({
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

  await attachArticleLinks(sourceId, tweetUrlEntries(input.tweet.entities));
  await attachNativeXArticle(sourceId, input.tweet, postId);
  await upsertFts(sourceId, tweetText(input.tweet));
  await enqueueContextJobs({
    accountId: input.accountId,
    tweet: input.tweet,
    page: input.page,
    sourceId,
  });
  await enqueueEnrichBatch();
  return { created: true, sourceId, postId };
}
