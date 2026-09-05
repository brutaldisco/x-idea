import { getClient } from "@/db/client";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { ingestBookmark, markUnavailable } from "@/server/ingest/bookmark";
import { enqueuePendingMediaDownloads } from "@/server/media/enqueue-pending";
import { getSyncSettings } from "@/server/settings";
import { estimateCostUsd } from "@/server/usage/estimate";
import {
  getXAccountSecret,
  listSyncableAccounts,
  markXAccountReauth,
  markXAccountSynced,
  type XAccountSecret,
} from "@/server/x/account";
import { fetchBookmarksPage, XApiError } from "@/server/x/client";
import { collectUntilHead } from "@/server/x/parse";
import { ensureValidToken, TokenRefreshError } from "@/server/x/token";

const PAGE_SIZE = 100;

export async function syncBookmarks(payload?: {
  x_account_id?: string;
  trigger?: "schedule" | "manual";
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

  for (const account of accounts) {
    await syncOneAccount(
      account,
      settings.saveReplies,
      payload?.trigger ?? "schedule",
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
  const mode = account.lastSyncHeadTweetId ? "incremental" : "initial";
  const maxPages = Math.max(1, Math.ceil(syncMaxPerRun / PAGE_SIZE));
  const started = new Date().toISOString();
  let pages = 0;
  let resources = 0;
  let created = 0;
  let newHead: string | null = null;
  let pagination: string | null = null;
  let remaining: number | null = null;
  let reset: string | null = null;

  try {
    const token = await ensureValidToken(account);

    for (let i = 0; i < maxPages; i += 1) {
      const page = await fetchBookmarksPage(token, account.xUserId, pagination);
      pages += 1;
      resources += page.resourcesRead;
      remaining = page.rateLimit.remaining;
      reset = page.rateLimit.reset;
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
      for (const error of page.errors) {
        if (error.resource_type === "tweet" && error.resource_id) {
          await markUnavailable(error.resource_id);
        }
      }
      if (cut.hitHead || !page.nextToken) {
        break;
      }
      pagination = page.nextToken;
    }

    const settings = await getSyncSettings();
    await enqueuePendingMediaDownloads(
      account.id,
      settings.mediaDownloadPerTick,
    );
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
      { accountId: account.id, created, pages, resources, mode },
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
