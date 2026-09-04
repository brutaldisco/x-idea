export const OWNED_READ_USD = 0.001;
export const POST_READ_USD = 0.005;
export const LOW_CREDIT_USD = 2;
export const USAGE_DAYS = 14;

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
  if (!Array.isArray(daily)) {
    return [];
  }
  const rows: { date: string; tweets: number }[] = [];
  for (const item of daily.slice(0, 31)) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const date = typeof row.date === "string" ? row.date : null;
    if (!date) {
      continue;
    }
    let tweets = 0;
    if (typeof row.tweets_consumed === "number") {
      tweets = row.tweets_consumed;
    } else if (Array.isArray(row.usage)) {
      for (const usage of row.usage) {
        if (usage && typeof usage === "object") {
          const consumed = Number(
            (usage as Record<string, unknown>).tweets_consumed ?? 0,
          );
          if (Number.isFinite(consumed)) {
            tweets += consumed;
          }
        }
      }
    }
    rows.push({ date, tweets });
  }
  return rows;
}
