import { getClient } from "@/db/client";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import {
  BACKFILL_PROBE_PAGE,
  backfillStep,
  leftoverBackfillCursor,
} from "@/lib/sync-backfill";
import {
  bookmarkPageSize,
  INITIAL_BOOKMARK_PAGE,
  isAutoSyncDue,
} from "@/lib/sync-policy";
import { enqueuePendingArticleFetches } from "@/server/fetch/enqueue-pending";
import {
  applyBookmarkPageErrors,
  ingestBookmark,
} from "@/server/ingest/bookmark";
import { enqueuePendingMediaDownloads } from "@/server/media/enqueue-pending";
import { getSyncSettings } from "@/server/settings";
import { runGoneSweepAndRecord } from "@/server/sources/gone-sweep";
import { estimateCostUsd } from "@/server/usage/estimate";
import {
  getXAccountSecret,
  listSyncableAccounts,
  markXAccountBackfill,
  markXAccountGoneSweep,
  markXAccountReauth,
  markXAccountSynced,
  type XAccountSecret,
} from "@/server/x/account";
import { fetchBookmarksPage, XApiError } from "@/server/x/client";
import { collectUntilHead } from "@/server/x/parse";
import { ensureValidToken, TokenRefreshError } from "@/server/x/token";

export async function syncBookmarks(payload?: {
  x_account_id?: string;
  trigger?: "schedule" | "manual";
  mode?: "backfill";
}): Promise<void> {
  const settings = await getSyncSettings();
  if (!settings.xApiEnabled) {
    logger.info("sync_bookmarks skipped: x_api_enabled off");
    return;
  }

  const accounts = payload?.x_account_id
    ? [await getXAccountSecret(payload.x_account_id)].filter(
        (row): row is XAccountSecret => Boolean(row?.syncEnabled),
      )
    : await listSyncableAccounts();
  const trigger = payload?.trigger ?? "schedule";
  const backfill = payload?.mode === "backfill";

  for (const account of accounts) {
    if (backfill) {
      await syncOneAccountBackfill(
        account,
        settings.saveReplies,
        trigger,
        settings.syncMaxPerRun,
      );
      continue;
    }
    if (
      trigger === "schedule" &&
      !isAutoSyncDue(account.lastSyncedAt, settings.syncIntervalMin)
    ) {
      logger.info(
        { accountId: account.id },
        "sync_bookmarks skipped: interval",
      );
      continue;
    }
    await syncOneAccount(
      account,
      settings.saveReplies,
      trigger,
      settings.syncMaxPerRun,
    );
  }
}

async function syncOneAccount(
  account: XAccountSecret,
  saveReplies: boolean,
  trigger: "schedule" | "manual",
  syncMaxPerRun: number,
): Promise<void> {
  const runId = newId();
  const incremental = Boolean(account.lastSyncHeadTweetId);
  const mode = incremental ? "incremental" : "initial";
  const pageSize = bookmarkPageSize(incremental);
  const maxPages = Math.max(1, Math.ceil(syncMaxPerRun / pageSize));
  const started = new Date().toISOString();
  let pages = 0;
  let resources = 0;
  let created = 0;
  let purged = 0;
  let newHead: string | null = null;
  let pagination: string | null = null;
  let lastNext: string | null = null;
  let remaining: number | null = null;
  let reset: string | null = null;

  try {
    const token = await ensureValidToken(account);

    for (let i = 0; i < maxPages; i += 1) {
      const page = await fetchBookmarksPage(
        token,
        account.xUserId,
        pagination,
        pageSize,
      );
      pages += 1;
      resources += page.resourcesRead;
      remaining = page.rateLimit.remaining;
      reset = page.rateLimit.reset;
      lastNext = page.nextToken;
      if (!newHead) {
        newHead = page.tweets[0]?.id ?? null;
      }

      const cut = collectUntilHead(page.tweets, account.lastSyncHeadTweetId);
      for (const tweet of cut.keep) {
        const result = await ingestBookmark({
          accountId: account.id,
          tweet,
          page,
          saveReplies,
        });
        if (result.created) {
          created += 1;
        }
      }
      const applied = await applyBookmarkPageErrors(account.id, page.errors);
      purged += applied.purged;
      if (cut.hitHead || !page.nextToken) {
        break;
      }
      pagination = page.nextToken;
    }

    const swept = await runGoneSweepAndRecord({
      accountId: account.id,
      accessToken: token,
      cursor: account.goneSweepCursor,
    });
    purged += swept.purged;
    if (swept.nextCursor !== account.goneSweepCursor) {
      await markXAccountGoneSweep(account.id, swept.nextCursor);
    }

    const leftover = leftoverBackfillCursor({
      nextToken: lastNext,
      alreadyExhausted: account.backfillExhausted,
      existingToken: account.backfillPaginationToken,
    });
    if (leftover) {
      await markXAccountBackfill(
        account.id,
        leftover.token,
        leftover.exhausted,
      );
    }

    await enqueuePendingMediaDownloads(account.id);
    await enqueuePendingArticleFetches(8);
    await markXAccountSynced(account.id, newHead);
    await writeRun({
      runId,
      accountId: account.id,
      trigger,
      mode,
      status: "ok",
      created,
      pages,
      resources,
      remaining,
      reset,
      started,
      error: null,
    });
    logger.info(
      { accountId: account.id, created, purged, pages, resources, mode },
      "sync_bookmarks done",
    );
  } catch (error) {
    if (
      (error instanceof XApiError &&
        (error.status === 401 || error.status === 403)) ||
      (error instanceof TokenRefreshError &&
        (error.status === 400 || error.status === 401))
    ) {
      await markXAccountReauth(account.id);
    }
    const message = error instanceof Error ? error.message : String(error);
    await writeRun({
      runId,
      accountId: account.id,
      trigger,
      mode,
      status: "error",
      created,
      pages,
      resources,
      remaining,
      reset,
      started,
      error: message.slice(0, 400),
    });
    throw error;
  }
}

async function syncOneAccountBackfill(
  account: XAccountSecret,
  saveReplies: boolean,
  trigger: "schedule" | "manual",
  syncMaxPerRun: number,
): Promise<void> {
  const runId = newId();
  const started = new Date().toISOString();
  let pages = 0;
  let resources = 0;
  let created = 0;
  let purged = 0;
  let pagination = account.backfillPaginationToken;
  const fromNewest = !pagination;
  let remaining: number | null = null;
  let reset: string | null = null;

  if (account.backfillExhausted) {
    logger.info({ accountId: account.id }, "bookmark backfill retry");
    await markXAccountBackfill(
      account.id,
      account.backfillPaginationToken,
      false,
    );
  }

  try {
    const token = await ensureValidToken(account);

    // X は max_results 未満のページで next_token を落とすことがある。
    // token が無いときは同じ位置を 10 件ページで読み直し、末尾かどうかを確かめる。
    // 読み直し分は通常ページとは別枠で syncMaxPerRun まで読む。
    let pageSize = INITIAL_BOOKMARK_PAGE;
    let probing = false;
    let normalBudget = Math.max(1, syncMaxPerRun);
    let probeBudget = Math.max(1, syncMaxPerRun);
    const maxIterations =
      Math.ceil((syncMaxPerRun * 2) / BACKFILL_PROBE_PAGE) + 4;
    let exhausted = false;

    for (let i = 0; i < maxIterations && !exhausted; i += 1) {
      if (probing ? probeBudget <= 0 : normalBudget <= 0) {
        break;
      }
      const page = await fetchBookmarksPage(
        token,
        account.xUserId,
        pagination,
        pageSize,
      );
      pages += 1;
      resources += page.resourcesRead;
      remaining = page.rateLimit.remaining;
      reset = page.rateLimit.reset;
      if (probing) {
        probeBudget -= page.resourcesRead;
      } else {
        normalBudget -= page.resourcesRead;
      }

      if (fromNewest && pages === 1 && !account.lastSyncHeadTweetId) {
        const head = page.tweets[0]?.id ?? null;
        if (head) {
          await markXAccountSynced(account.id, head);
        }
      }

      for (const tweet of page.tweets) {
        const result = await ingestBookmark({
          accountId: account.id,
          tweet,
          page,
          saveReplies,
        });
        if (result.created) {
          created += 1;
        }
      }
      const applied = await applyBookmarkPageErrors(account.id, page.errors);
      purged += applied.purged;

      const step = backfillStep({
        nextToken: page.nextToken,
        fetched: page.tweets.length,
        pageSize,
      });
      if (step.action === "continue") {
        pagination = step.token;
        await markXAccountBackfill(account.id, pagination, false);
      } else if (step.action === "probe") {
        probing = true;
        pageSize = step.pageSize;
        await markXAccountBackfill(account.id, pagination, false);
      } else {
        pagination = null;
        await markXAccountBackfill(account.id, null, true);
        exhausted = true;
      }
    }

    const swept = await runGoneSweepAndRecord({
      accountId: account.id,
      accessToken: token,
      cursor: account.goneSweepCursor,
    });
    purged += swept.purged;
    if (swept.nextCursor !== account.goneSweepCursor) {
      await markXAccountGoneSweep(account.id, swept.nextCursor);
    }

    await enqueuePendingMediaDownloads(account.id);
    await enqueuePendingArticleFetches(8);
    await writeRun({
      runId,
      accountId: account.id,
      trigger,
      mode: "backfill",
      status: "ok",
      created,
      pages,
      resources,
      remaining,
      reset,
      started,
      error: null,
    });
    logger.info(
      { accountId: account.id, created, purged, pages, resources },
      "bookmark backfill done",
    );
  } catch (error) {
    if (
      (error instanceof XApiError &&
        (error.status === 401 || error.status === 403)) ||
      (error instanceof TokenRefreshError &&
        (error.status === 400 || error.status === 401))
    ) {
      await markXAccountReauth(account.id);
    }
    const message = error instanceof Error ? error.message : String(error);
    await writeRun({
      runId,
      accountId: account.id,
      trigger,
      mode: "backfill",
      status: "error",
      created,
      pages,
      resources,
      remaining,
      reset,
      started,
      error: message.slice(0, 400),
    });
    throw error;
  }
}

async function writeRun(input: {
  runId: string;
  accountId: string;
  trigger: "schedule" | "manual";
  mode: string;
  status: string;
  created: number;
  pages: number;
  resources: number;
  remaining: number | null;
  reset: string | null;
  started: string;
  error: string | null;
}): Promise<void> {
  await getClient().execute({
    sql: `INSERT INTO sync_runs (
      id, x_account_id, trigger, mode, status, new_sources, pages_fetched,
      resources_read, est_cost_usd, rate_limit_remaining, rate_limit_reset,
      error_message, started_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      input.runId,
      input.accountId,
      input.trigger,
      input.mode,
      input.status,
      input.created,
      input.pages,
      input.resources,
      estimateCostUsd(input.resources),
      input.remaining,
      input.reset,
      input.error,
      input.started,
    ],
  });
}
