import { rm, unlink } from "node:fs/promises";
import { getClient, isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { resolveMediaPath, safeMediaSegment } from "@/server/media/paths";
import {
  advanceSyncHeadIfNeeded,
  rememberDismissedBookmark,
} from "@/server/sources/dismiss";
import { sourceScopeSql } from "@/server/sources/scope";
import { getXAccountSecret } from "@/server/x/account";
import { removeBookmark, XApiError } from "@/server/x/client";
import { type AccountContext, contextAccountId } from "@/server/x/context";
import { hasOauthScope } from "@/server/x/pkce";
import { ensureValidToken } from "@/server/x/token";

async function deleteFts(sourceId: string): Promise<void> {
  try {
    await getClient().execute({
      sql: "DELETE FROM sources_fts WHERE source_id = ?",
      args: [sourceId],
    });
  } catch (error) {
    logger.warn({ err: error, sourceId }, "sources_fts delete skipped");
  }
}

async function unlinkLocalMedia(paths: string[]): Promise<void> {
  for (const rel of paths) {
    try {
      await unlink(resolveMediaPath(rel));
    } catch {
      // already gone or never saved
    }
  }
}

async function removeTweetMediaDir(
  accountId: string | null,
  tweetId: string | null,
): Promise<void> {
  if (!accountId || !tweetId) {
    return;
  }
  try {
    const rel = `${safeMediaSegment(accountId)}/${safeMediaSegment(tweetId)}`;
    await rm(resolveMediaPath(rel), { recursive: true, force: true });
  } catch {
    // ignore missing folders
  }
}

type FoundSource = {
  id: string;
  xPostId: string | null;
  articleId: string | null;
  xAccountId: string | null;
  tweetId: string | null;
};

function foundSourceFromRow(row: Record<string, unknown>): FoundSource {
  return {
    id: String(row.id),
    xPostId: row.x_post_id ? String(row.x_post_id) : null,
    articleId: row.article_id ? String(row.article_id) : null,
    xAccountId: row.x_account_id ? String(row.x_account_id) : null,
    tweetId: row.tweet_id ? String(row.tweet_id) : null,
  };
}

async function deleteFoundSource(
  row: FoundSource,
  fallbackAccountId?: string | null,
): Promise<void> {
  const sourceId = row.id;
  const xPostId = row.xPostId;
  const tweetId = row.tweetId;
  const xAccountId = row.xAccountId;
  const articleIds = new Set<string>();
  if (row.articleId) {
    articleIds.add(row.articleId);
  }

  const linked = await getClient().execute({
    sql: "SELECT article_id FROM source_articles WHERE source_id = ? LIMIT 50",
    args: [sourceId],
  });
  for (const item of linked.rows) {
    if (item.article_id) {
      articleIds.add(String(item.article_id));
    }
  }

  const media = xPostId
    ? await getClient().execute({
        sql: `SELECT local_path FROM media_assets
              WHERE x_post_id = ? AND local_path IS NOT NULL
              LIMIT 50`,
        args: [xPostId],
      })
    : { rows: [] };
  const paths = media.rows.flatMap((item) =>
    item.local_path ? [String(item.local_path)] : [],
  );

  const dismissAccountId = xAccountId ?? fallbackAccountId ?? null;
  if (tweetId && dismissAccountId) {
    await rememberDismissedBookmark(dismissAccountId, tweetId);
    await tryUnbookmark(dismissAccountId, tweetId);
  }

  await unlinkLocalMedia(paths);
  await removeTweetMediaDir(xAccountId, tweetId);
  await deleteFts(sourceId);

  await getClient().execute({
    sql: "DELETE FROM sources WHERE id = ?",
    args: [sourceId],
  });

  if (xPostId) {
    const others = await getClient().execute({
      sql: "SELECT id FROM sources WHERE x_post_id = ? LIMIT 1",
      args: [xPostId],
    });
    if (others.rows.length === 0) {
      if (tweetId) {
        await getClient().execute({
          sql: "DELETE FROM x_post_folders WHERE tweet_id = ?",
          args: [tweetId],
        });
      }
      await getClient().execute({
        sql: "DELETE FROM x_posts WHERE id = ?",
        args: [xPostId],
      });
    }
  }

  for (const articleId of articleIds) {
    const usedSource = await getClient().execute({
      sql: "SELECT id FROM sources WHERE article_id = ? LIMIT 1",
      args: [articleId],
    });
    const usedLink = await getClient().execute({
      sql: "SELECT source_id FROM source_articles WHERE article_id = ? LIMIT 1",
      args: [articleId],
    });
    if (usedSource.rows.length === 0 && usedLink.rows.length === 0) {
      await getClient().execute({
        sql: "DELETE FROM articles WHERE id = ?",
        args: [articleId],
      });
    }
  }

  if (tweetId && dismissAccountId) {
    await advanceSyncHeadIfNeeded(dismissAccountId, tweetId);
  }

  logger.info({ sourceId }, "source deleted");
}

export async function deleteSource(
  sourceId: string,
  ctx: AccountContext,
): Promise<void> {
  if (!isDbConfigured()) {
    throw new AppError("NOT_FOUND", "Source がありません");
  }
  await ensureSchema();
  const scope = sourceScopeSql(contextAccountId(ctx), "s");
  const found = await getClient().execute({
    sql: `SELECT s.id, s.x_post_id, s.article_id, s.x_account_id, p.tweet_id
          FROM sources s
          LEFT JOIN x_posts p ON p.id = s.x_post_id
          WHERE s.id = ? AND ${scope.clause}
          LIMIT 1`,
    args: [sourceId, ...scope.args],
  });
  const row = found.rows[0];
  if (!row) {
    throw new AppError("NOT_FOUND", "Source がありません");
  }
  await deleteFoundSource(foundSourceFromRow(row), contextAccountId(ctx));
}

/** X 上で消えた tweet をアプリから消し、ブックマークも外す。Source が無くても外す。 */
export async function purgeGoneBookmark(
  accountId: string,
  tweetId: string,
): Promise<"deleted" | "unbookmarked"> {
  if (!isDbConfigured()) {
    return "unbookmarked";
  }
  await ensureSchema();
  const found = await getClient().execute({
    sql: `SELECT s.id, s.x_post_id, s.article_id, s.x_account_id, p.tweet_id
          FROM sources s
          JOIN x_posts p ON p.id = s.x_post_id
          WHERE s.x_account_id = ? AND p.tweet_id = ?
          LIMIT 1`,
    args: [accountId, tweetId],
  });
  const row = found.rows[0];
  if (row) {
    await deleteFoundSource(foundSourceFromRow(row), accountId);
    return "deleted";
  }
  await rememberDismissedBookmark(accountId, tweetId);
  await tryUnbookmark(accountId, tweetId);
  logger.info({ accountId, tweetId }, "gone bookmark unbookmarked");
  return "unbookmarked";
}

async function tryUnbookmark(
  accountId: string,
  tweetId: string,
): Promise<void> {
  const account = await getXAccountSecret(accountId);
  if (!account) {
    return;
  }
  const scopes = await getClient().execute({
    sql: "SELECT scopes_json FROM x_account WHERE id = ? LIMIT 1",
    args: [accountId],
  });
  if (
    !hasOauthScope(
      scopes.rows[0]?.scopes_json ? String(scopes.rows[0].scopes_json) : null,
      "bookmark.write",
    )
  ) {
    logger.info({ accountId }, "unbookmark skipped: no bookmark.write");
    return;
  }
  try {
    const token = await ensureValidToken(account);
    await removeBookmark(token, account.xUserId, tweetId);
    logger.info({ accountId, tweetId }, "x bookmark removed");
  } catch (error) {
    if (error instanceof XApiError && error.status === 401) {
      try {
        const token = await ensureValidToken({
          ...account,
          tokenExpiresAt: "1970-01-01T00:00:00.000Z",
        });
        await removeBookmark(token, account.xUserId, tweetId);
        logger.info({ accountId, tweetId }, "x bookmark removed");
        return;
      } catch (retryError) {
        logger.warn({ err: retryError, tweetId }, "unbookmark failed");
        return;
      }
    }
    logger.warn({ err: error, tweetId }, "unbookmark failed");
  }
}
