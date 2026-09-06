export const OWNED_READ_USD = 0.001;
export const POST_READ_USD = 0.005;
export const LOW_CREDIT_USD = 2;
export const USAGE_DAYS = 14;
export const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

const OWNED_READ_MODES = new Set(["initial", "incremental"]);
const POST_READ_MODES = new Set(["parent", "thread", "reply_context"]);

export type RemainingSource = "live" | "snapshot" | "purchased" | "unknown";

export function roundUsd(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function estimateCostUsd(resources: number): number {
  return roundUsd(Math.max(0, resources) * OWNED_READ_USD);
}

export function estimatePostReadUsd(resources: number): number {
  return roundUsd(Math.max(0, resources) * POST_READ_USD);
}

export type SyncUsageRow = {
  accountId: string | null;
  mode: string;
  startedAt: string;
  resourcesRead: number;
  newSources: number;
  recordedCostUsd: number;
};

export type BilledCharge = {
  startedAt: string;
  date: string;
  accountId: string | null;
  resources: number;
  costUsd: number;
};

export type BilledUsage = {
  usedUsd: number;
  usedResources: number;
  charges: BilledCharge[];
  daily: Map<string, { costUsd: number; resources: number }>;
  accounts: Map<string, { resources: number; costUsd: number }>;
};

export function parseRunAt(value: string): number {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(trimmed)) {
    const at = Date.parse(`${trimmed.replace(" ", "T")}Z`);
    if (Number.isFinite(at)) {
      return at;
    }
  }
  const at = Date.parse(trimmed);
  return Number.isFinite(at) ? at : 0;
}

export function dateKeyFromRun(startedAt: string): string {
  const match = startedAt.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }
  return new Date(parseRunAt(startedAt)).toISOString().slice(0, 10);
}

function addBucket(
  buckets: Map<string, { costUsd: number; resources: number }>,
  key: string,
  resources: number,
  costUsd: number,
): void {
  const prev = buckets.get(key) ?? { costUsd: 0, resources: 0 };
  buckets.set(key, {
    resources: prev.resources + resources,
    costUsd: roundUsd(prev.costUsd + costUsd),
  });
}

/**
 * X は同じリソースを 24 時間以内に再取得しても課金しない。
 * incremental の resources_read 合計をそのまま足すと残量が大きくずれる。
 */
export function estimateBilledUsage(runs: SyncUsageRow[]): BilledUsage {
  const ordered = [...runs].sort(
    (a, b) => parseRunAt(a.startedAt) - parseRunAt(b.startedAt),
  );
  const lastOwnedReadAt = new Map<string, number>();
  const daily = new Map<string, { costUsd: number; resources: number }>();
  const accounts = new Map<string, { resources: number; costUsd: number }>();
  const charges: BilledCharge[] = [];
  let usedUsd = 0;
  let usedResources = 0;

  for (const run of ordered) {
    const at = parseRunAt(run.startedAt);
    const accountKey = run.accountId ?? "";
    let resources = 0;
    let costUsd = 0;

    if (OWNED_READ_MODES.has(run.mode)) {
      const prev = lastOwnedReadAt.get(accountKey);
      const chargeFull = prev == null || at - prev >= DEDUP_WINDOW_MS;
      resources = Math.max(0, chargeFull ? run.resourcesRead : run.newSources);
      costUsd = estimateCostUsd(resources);
      if (run.resourcesRead > 0 || run.newSources > 0) {
        lastOwnedReadAt.set(accountKey, at);
      }
    } else if (POST_READ_MODES.has(run.mode)) {
      resources = Math.max(0, run.resourcesRead);
      costUsd =
        run.recordedCostUsd > 0
          ? roundUsd(run.recordedCostUsd)
          : estimatePostReadUsd(resources);
    } else {
      resources = Math.max(0, run.resourcesRead);
      costUsd =
        run.recordedCostUsd > 0
          ? roundUsd(run.recordedCostUsd)
          : estimateCostUsd(resources);
    }

    if (resources <= 0 && costUsd <= 0) {
      continue;
    }
    usedUsd = roundUsd(usedUsd + costUsd);
    usedResources += resources;
    const date = dateKeyFromRun(run.startedAt);
    charges.push({
      startedAt: run.startedAt,
      date,
      accountId: run.accountId,
      resources,
      costUsd,
    });
    addBucket(daily, date, resources, costUsd);
    addBucket(accounts, accountKey, resources, costUsd);
  }

  return { usedUsd, usedResources, charges, daily, accounts };
}

export function billedSince(
  billed: BilledUsage,
  sinceAt: string | null,
): number {
  if (!sinceAt) {
    return billed.usedUsd;
  }
  const since = parseRunAt(sinceAt);
  let sum = 0;
  for (const charge of billed.charges) {
    if (parseRunAt(charge.startedAt) >= since) {
      sum += charge.costUsd;
    }
  }
  return roundUsd(sum);
}

export function lastDateKeys(
  days: number,
  timeZone: string,
  now = new Date(),
): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const at = new Date(now.getTime() - i * 86_400_000);
    keys.push(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(at),
    );
  }
  return keys;
}

export function remainingCredits(input: {
  liveRemainingUsd: number | null;
  purchasedUsd: number;
  snapshotRemainingUsd: number | null;
  usedSinceSnapshotUsd: number;
  lifetimeUsedUsd: number;
}): { remainingUsd: number | null; source: RemainingSource } {
  if (input.liveRemainingUsd != null) {
    return { remainingUsd: roundUsd(input.liveRemainingUsd), source: "live" };
  }
  if (input.snapshotRemainingUsd != null) {
    return {
      remainingUsd: roundUsd(
        input.snapshotRemainingUsd - input.usedSinceSnapshotUsd,
      ),
      source: "snapshot",
    };
  }
  if (input.purchasedUsd > 0) {
    return {
      remainingUsd: roundUsd(input.purchasedUsd - input.lifetimeUsedUsd),
      source: "purchased",
    };
  }
  return { remainingUsd: null, source: "unknown" };
}

export function remainingRatio(
  remainingUsd: number | null,
  purchasedUsd: number,
  usedUsd: number,
): number | null {
  if (remainingUsd == null) {
    return null;
  }
  const capacity =
    purchasedUsd > 0
      ? purchasedUsd
      : Math.max(remainingUsd + usedUsd, remainingUsd);
  if (capacity <= 0) {
    return remainingUsd > 0 ? 1 : 0;
  }
  return Math.min(1, Math.max(0, remainingUsd / capacity));
}

export function isLowRemaining(remainingUsd: number | null): boolean {
  return remainingUsd != null && remainingUsd <= LOW_CREDIT_USD;
}

export function firstNumeric(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = firstNumeric(value as Record<string, unknown>, [
        "amount",
        "usd",
        "balance",
        "value",
      ]);
      if (nested != null) {
        return nested;
      }
    }
  }
  return null;
}

export function parseCreditBalance(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const root = payload as Record<string, unknown>;
  const candidates: Record<string, unknown>[] = [root];
  if (root.data && typeof root.data === "object") {
    candidates.push(root.data as Record<string, unknown>);
  }
  const keys = [
    "credit_balance",
    "remaining_balance",
    "remaining_usd",
    "balance_usd",
    "credits_usd",
    "balance",
    "remaining",
    "credits",
    "amount_usd",
  ];
  for (const candidate of candidates) {
    const found = firstNumeric(candidate, keys);
    if (found != null) {
      return roundUsd(found);
    }
  }
  return null;
}

function asUsageCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function asDateKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function tweetsFromUsageRow(row: Record<string, unknown>): number {
  if (row.tweets_consumed != null) {
    return asUsageCount(row.tweets_consumed);
  }
  if (typeof row.usage === "string" || typeof row.usage === "number") {
    return asUsageCount(row.usage);
  }
  if (!Array.isArray(row.usage)) {
    return 0;
  }
  let tweets = 0;
  for (const usage of row.usage) {
    if (!usage || typeof usage !== "object") {
      continue;
    }
    const item = usage as Record<string, unknown>;
    tweets += asUsageCount(
      item.tweets_consumed ?? item.usage ?? item.usage_result_count,
    );
  }
  return tweets;
}

export function parseTweetUsageDays(payload: unknown): {
  date: string;
  tweets: number;
}[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  const daily = data.daily_project_usage;
  const items: unknown[] = [];
  if (Array.isArray(daily)) {
    items.push(...daily);
  } else if (daily && typeof daily === "object") {
    const nested = (daily as Record<string, unknown>).usage;
    if (Array.isArray(nested)) {
      items.push(...nested);
    }
  }
  const rows: { date: string; tweets: number }[] = [];
  for (const item of items.slice(0, 90)) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const date = asDateKey(row.date);
    if (!date) {
      continue;
    }
    rows.push({ date, tweets: tweetsFromUsageRow(row) });
  }
  return rows;
}
