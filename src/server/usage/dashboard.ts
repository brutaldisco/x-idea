import { getClient, isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { logger } from "@/lib/logger";
import {
  estimateCostUsd,
  isLowRemaining,
  lastDateKeys,
  remainingCredits,
  remainingRatio,
  USAGE_DAYS,
} from "@/server/usage/estimate";
import { readLedger } from "@/server/usage/ledger";
import { fetchXUsageLive, type XUsageLive } from "@/server/usage/x-api";
import { listXAccounts } from "@/server/x/account";

const CACHE_MS = 15 * 60 * 1000;
const AI_LANES = ["bulk", "quality", "embed"] as const;

export type UsageLane = (typeof AI_LANES)[number];

export type UsageDashboard = {
  x: {
    remainingUsd: number | null;
    source: "live" | "snapshot" | "purchased" | "unknown";
    purchasedUsd: number;
    usedUsd: number;
    usedResources: number;
    ratio: number | null;
    low: boolean;
    liveError: string | null;
    fetchedAt: string | null;
    daily: { date: string; costUsd: number; resources: number }[];
    accounts: {
      id: string | null;
      username: string;
      resources: number;
      costUsd: number;
    }[];
  };
  ai: {
    resetHint: string;
    lanes: { lane: UsageLane; used: number; cap: number; remaining: number }[];
    daily: { date: string; bulk: number; quality: number; embed: number }[];
  };
};

const EMPTY: UsageDashboard = {
  x: {
    remainingUsd: null,
    source: "unknown",
    purchasedUsd: 0,
    usedUsd: 0,
    usedResources: 0,
    ratio: null,
    low: false,
    liveError: null,
    fetchedAt: null,
    daily: [],
    accounts: [],
  },
  ai: {
    resetHint: "太平洋時間 0:00（日本時間 16:00 / 17:00）にリセット",
    lanes: [
      { lane: "bulk", used: 0, cap: 400, remaining: 400 },
      { lane: "quality", used: 0, cap: 16, remaining: 16 },
      { lane: "embed", used: 0, cap: 800, remaining: 800 },
    ],
    daily: [],
  },
};

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function parseCache(raw: unknown): XUsageLive | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as Partial<XUsageLive>;
  if (typeof row.fetchedAt !== "string") {
    return null;
  }
  if (Date.now() - Date.parse(row.fetchedAt) > CACHE_MS) {
    return null;
  }
  return {
    remainingUsd:
      typeof row.remainingUsd === "number" ? row.remainingUsd : null,
    dailyTweets: Array.isArray(row.dailyTweets) ? row.dailyTweets : [],
    fetchedAt: row.fetchedAt,
    error: typeof row.error === "string" ? row.error : null,
  };
}

async function loadLive(force: boolean): Promise<XUsageLive> {
  const client = getClient();
  if (!force) {
    const cached = await client.execute(
      "SELECT x_usage_cache_json FROM settings WHERE id = 1 LIMIT 1",
    );
    let parsed: XUsageLive | null = null;
    try {
      parsed = parseCache(
        JSON.parse(String(cached.rows[0]?.x_usage_cache_json ?? "null")),
      );
    } catch {
      parsed = null;
    }
    if (parsed) {
      return parsed;
    }
  }
  const live = await fetchXUsageLive();
  try {
    await client.execute({
      sql: `UPDATE settings
            SET x_usage_cache_json = ?, updated_at = datetime('now')
            WHERE id = 1`,
      args: [JSON.stringify(live)],
    });
  } catch (error) {
    logger.warn({ err: error }, "x usage cache write failed");
  }
  return live;
}

export async function getUsageDashboard(options?: {
  refresh?: boolean;
}): Promise<UsageDashboard> {
  if (!isDbConfigured()) {
    return EMPTY;
  }
  await ensureSchema();
  const client = getClient();
  const since = sinceIso(USAGE_DAYS);
  const tokyoDays = lastDateKeys(USAGE_DAYS, "Asia/Tokyo");
  const ptDays = lastDateKeys(USAGE_DAYS, "America/Los_Angeles");

  const [
    ledger,
    accounts,
    live,
    settings,
    sourceCounts,
    sourceDays,
    runSums,
    runDays,
    aiToday,
  ] = await Promise.all([
    readLedger(),
    listXAccounts(),
    loadLive(options?.refresh === true),
    client.execute(
      "SELECT ai_lane_caps_json FROM settings WHERE id = 1 LIMIT 1",
    ),
    client.execute(
      `SELECT x_account_id, COUNT(*) AS n
         FROM sources
         WHERE origin = 'x_bookmark'
         GROUP BY x_account_id
         LIMIT 16`,
    ),
    client.execute({
      sql: `SELECT substr(saved_at, 1, 10) AS d, COUNT(*) AS n
              FROM sources
              WHERE origin = 'x_bookmark' AND saved_at >= ?
              GROUP BY d
              LIMIT 31`,
      args: [since],
    }),
    client.execute(
      `SELECT COALESCE(SUM(resources_read), 0) AS n,
                COALESCE(SUM(est_cost_usd), 0) AS cost
         FROM sync_runs
         LIMIT 1`,
    ),
    client.execute({
      sql: `SELECT substr(started_at, 1, 10) AS d,
                     COALESCE(SUM(resources_read), 0) AS n,
                     COALESCE(SUM(est_cost_usd), 0) AS cost
              FROM sync_runs
              WHERE started_at >= ?
              GROUP BY d
              LIMIT 31`,
      args: [since],
    }),
    client.execute({
      sql: `SELECT day_pt, lane, requests
              FROM ai_usage_daily
              WHERE day_pt >= ?
              LIMIT 64`,
      args: [ptDays[0] ?? since.slice(0, 10)],
    }),
  ]);

  let usedSinceSnapshotUsd = 0;
  if (ledger.snapshotAt) {
    const sinceSnap = await client.execute({
      sql: `SELECT COALESCE(SUM(est_cost_usd), 0) AS cost,
                   COALESCE(SUM(resources_read), 0) AS n
            FROM sync_runs
            WHERE started_at >= ?
            LIMIT 1`,
      args: [ledger.snapshotAt],
    });
    const runCost = Number(sinceSnap.rows[0]?.cost ?? 0);
    if (runCost > 0) {
      usedSinceSnapshotUsd = runCost;
    } else {
      const saved = await client.execute({
        sql: `SELECT COUNT(*) AS n
              FROM sources
              WHERE origin = 'x_bookmark' AND saved_at >= ?
              LIMIT 1`,
        args: [ledger.snapshotAt],
      });
      usedSinceSnapshotUsd = estimateCostUsd(Number(saved.rows[0]?.n ?? 0));
    }
  }

  const names = new Map(
    accounts.map((account) => [account.id, account.username]),
  );
  const accountRows = sourceCounts.rows.map((row) => {
    const id = row.x_account_id ? String(row.x_account_id) : null;
    const resources = Number(row.n ?? 0);
    return {
      id,
      username: id ? (names.get(id) ?? id) : "未割当",
      resources,
      costUsd: estimateCostUsd(resources),
    };
  });
  accountRows.sort((a, b) => b.costUsd - a.costUsd);

  const sourceResources = accountRows.reduce(
    (sum, row) => sum + row.resources,
    0,
  );
  const runResources = Number(runSums.rows[0]?.n ?? 0);
  const runCost = Number(runSums.rows[0]?.cost ?? 0);
  const usedResources = Math.max(sourceResources, runResources);
  const usedUsd = Math.max(estimateCostUsd(sourceResources), runCost);

  const credit = remainingCredits({
    liveRemainingUsd: live.remainingUsd,
    purchasedUsd: ledger.purchasedUsd,
    snapshotRemainingUsd: ledger.snapshotRemainingUsd,
    usedSinceSnapshotUsd,
    lifetimeUsedUsd: usedUsd,
  });

  const dailyCost = new Map<string, { costUsd: number; resources: number }>();
  for (const row of sourceDays.rows) {
    const date = String(row.d ?? "");
    const resources = Number(row.n ?? 0);
    dailyCost.set(date, { costUsd: estimateCostUsd(resources), resources });
  }
  for (const row of runDays.rows) {
    const date = String(row.d ?? "");
    const resources = Number(row.n ?? 0);
    const costUsd = Number(row.cost ?? 0);
    const prev = dailyCost.get(date);
    dailyCost.set(date, {
      resources: Math.max(prev?.resources ?? 0, resources),
      costUsd: Math.max(
        prev?.costUsd ?? 0,
        costUsd,
        estimateCostUsd(resources),
      ),
    });
  }
  for (const day of live.dailyTweets) {
    const prev = dailyCost.get(day.date);
    const fromApi = estimateCostUsd(day.tweets);
    dailyCost.set(day.date, {
      resources: Math.max(prev?.resources ?? 0, day.tweets),
      costUsd: Math.max(prev?.costUsd ?? 0, fromApi),
    });
  }

  const caps = { bulk: 400, quality: 16, embed: 800 };
  try {
    const parsed = JSON.parse(
      String(settings.rows[0]?.ai_lane_caps_json ?? "{}"),
    ) as Partial<Record<UsageLane, number>>;
    for (const lane of AI_LANES) {
      if (typeof parsed[lane] === "number") {
        caps[lane] = parsed[lane] ?? caps[lane];
      }
    }
  } catch {
    // keep defaults
  }

  const aiByDay = new Map<string, Record<UsageLane, number>>();
  for (const row of aiToday.rows) {
    const lane = String(row.lane);
    const requests = Number(row.requests ?? 0);
    if (lane === "bulk" || lane === "quality" || lane === "embed") {
      const day = String(row.day_pt);
      const bucket = aiByDay.get(day) ?? { bulk: 0, quality: 0, embed: 0 };
      bucket[lane] += requests;
      aiByDay.set(day, bucket);
    }
  }
  const todayPt = lastDateKeys(1, "America/Los_Angeles")[0];
  const aiUsed = aiByDay.get(todayPt ?? "") ?? {
    bulk: 0,
    quality: 0,
    embed: 0,
  };

  return {
    x: {
      remainingUsd: credit.remainingUsd,
      source: credit.source,
      purchasedUsd: ledger.purchasedUsd,
      usedUsd,
      usedResources,
      ratio: remainingRatio(credit.remainingUsd, ledger.purchasedUsd, usedUsd),
      low: isLowRemaining(credit.remainingUsd),
      liveError: live.remainingUsd == null ? live.error : null,
      fetchedAt: live.fetchedAt,
      daily: tokyoDays.map((date) => ({
        date,
        costUsd: dailyCost.get(date)?.costUsd ?? 0,
        resources: dailyCost.get(date)?.resources ?? 0,
      })),
      accounts: accountRows,
    },
    ai: {
      resetHint: "太平洋時間 0:00（日本時間 16:00 / 17:00）にリセット",
      lanes: AI_LANES.map((lane) => ({
        lane,
        used: aiUsed[lane],
        cap: caps[lane],
        remaining: Math.max(0, caps[lane] - aiUsed[lane]),
      })),
      daily: ptDays.map((date) => ({
        date,
        ...(aiByDay.get(date) ?? { bulk: 0, quality: 0, embed: 0 }),
      })),
    },
  };
}
