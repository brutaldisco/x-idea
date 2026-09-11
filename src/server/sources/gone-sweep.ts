import { getClient } from "@/db/client";
import { logger } from "@/lib/logger";
import { applyBookmarkPageErrors } from "@/server/ingest/bookmark";
import { fetchTweetsByIds } from "@/server/x/client";
import { writeContextRun } from "@/server/x/context-spend";

export const GONE_SWEEP_BATCH = 100;

export type GoneSweepCursor = {
  savedAt: string;
  sourceId: string;
};

export function parseGoneSweepCursor(
  raw: string | null | undefined,
): GoneSweepCursor | null {
  if (!raw) {
    return null;
  }
  const sep = raw.indexOf("\t");
  if (sep < 1) {
    return null;
  }
  const savedAt = raw.slice(0, sep);
  const sourceId = raw.slice(sep + 1);
  if (!savedAt || !sourceId) {
    return null;
  }
  return { savedAt, sourceId };
}

export function formatGoneSweepCursor(
  savedAt: string,
  sourceId: string,
): string {
  return `${savedAt}\t${sourceId}`;
}

export async function listSavedTweetsForSweep(
  accountId: string,
  cursor: GoneSweepCursor | null,
  limit = GONE_SWEEP_BATCH,
): Promise<{ tweetId: string; savedAt: string; sourceId: string }[]> {
  const cap = Math.min(GONE_SWEEP_BATCH, Math.max(1, Math.round(limit)));
  const result = cursor
    ? await getClient().execute({
        sql: `SELECT s.id AS source_id, p.tweet_id AS tweet_id,
                     COALESCE(s.saved_at, s.bookmarked_at, s.created_at) AS saved_at
              FROM sources s
              JOIN x_posts p ON p.id = s.x_post_id
              WHERE s.x_account_id = ?
                AND p.tweet_id IS NOT NULL
                AND (
                  COALESCE(s.saved_at, s.bookmarked_at, s.created_at) > ?
                  OR (
                    COALESCE(s.saved_at, s.bookmarked_at, s.created_at) = ?
                    AND s.id > ?
                  )
                )
              ORDER BY COALESCE(s.saved_at, s.bookmarked_at, s.created_at) ASC, s.id ASC
              LIMIT ?`,
        args: [accountId, cursor.savedAt, cursor.savedAt, cursor.sourceId, cap],
      })
    : await getClient().execute({
        sql: `SELECT s.id AS source_id, p.tweet_id AS tweet_id,
                     COALESCE(s.saved_at, s.bookmarked_at, s.created_at) AS saved_at
              FROM sources s
              JOIN x_posts p ON p.id = s.x_post_id
              WHERE s.x_account_id = ? AND p.tweet_id IS NOT NULL
              ORDER BY COALESCE(s.saved_at, s.bookmarked_at, s.created_at) ASC, s.id ASC
              LIMIT ?`,
        args: [accountId, cap],
      });
  return result.rows.flatMap((row) => {
    const tweetId = row.tweet_id ? String(row.tweet_id) : "";
    const savedAt = row.saved_at ? String(row.saved_at) : "";
    const sourceId = row.source_id ? String(row.source_id) : "";
    return tweetId && savedAt && sourceId
      ? [{ tweetId, savedAt, sourceId }]
      : [];
  });
}

export async function sweepGoneSavedBookmarks(input: {
  accountId: string;
  accessToken: string;
  cursor: string | null;
}): Promise<{
  purged: number;
  unavailable: number;
  checked: number;
  nextCursor: string | null;
}> {
  const parsed = parseGoneSweepCursor(input.cursor);
  const rows = await listSavedTweetsForSweep(input.accountId, parsed);
  if (rows.length === 0) {
    return {
      purged: 0,
      unavailable: 0,
      checked: 0,
      nextCursor: input.cursor,
    };
  }
  const page = await fetchTweetsByIds(
    input.accessToken,
    rows.map((row) => row.tweetId),
  );
  const applied = await applyBookmarkPageErrors(input.accountId, page.errors);
  const last = rows[rows.length - 1];
  const nextCursor = formatGoneSweepCursor(last.savedAt, last.sourceId);
  logger.info(
    {
      accountId: input.accountId,
      checked: rows.length,
      purged: applied.purged,
      unavailable: applied.unavailable,
    },
    "gone sweep done",
  );
  return {
    purged: applied.purged,
    unavailable: applied.unavailable,
    checked: rows.length,
    nextCursor,
  };
}

export async function runGoneSweepAndRecord(input: {
  accountId: string;
  accessToken: string;
  cursor: string | null;
}): Promise<{ purged: number; nextCursor: string | null }> {
  try {
    const swept = await sweepGoneSavedBookmarks(input);
    if (swept.checked > 0) {
      await writeContextRun({
        accountId: input.accountId,
        mode: "gone_sweep",
        resources: swept.checked,
        status: "ok",
      });
    }
    return { purged: swept.purged, nextCursor: swept.nextCursor };
  } catch (error) {
    logger.warn(
      { err: error, accountId: input.accountId },
      "gone sweep failed",
    );
    return { purged: 0, nextCursor: input.cursor };
  }
}
