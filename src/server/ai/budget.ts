import { getClient } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { nextMidnightPacific, pacificDay } from "@/lib/datetime";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { Lane } from "@/server/ai/lanes";
import { getAiLaneSettings } from "@/server/settings";

export type GuardDecision =
  | { ok: true }
  | { ok: false; code: "LANE_COOLDOWN"; retryAfter: Date }
  | { ok: false; code: "LANE_CAP"; retryAfter: Date }
  | { ok: false; code: "FORBIDDEN"; message: string };

export function decideCall(input: {
  now: Date;
  used: number;
  cap: number;
  cooldownUntil?: string | null;
  paused: boolean;
}): GuardDecision {
  if (input.paused) {
    return { ok: false, code: "FORBIDDEN", message: "AI は一時停止中です" };
  }
  const cooldownAt = input.cooldownUntil
    ? Date.parse(input.cooldownUntil)
    : Number.NaN;
  if (Number.isFinite(cooldownAt) && cooldownAt > input.now.getTime()) {
    return {
      ok: false,
      code: "LANE_COOLDOWN",
      retryAfter: new Date(cooldownAt),
    };
  }
  if (input.used >= input.cap) {
    return {
      ok: false,
      code: "LANE_CAP",
      retryAfter: nextMidnightPacific(input.now),
    };
  }
  return { ok: true };
}

export function collectQuotaIds(value: unknown, acc: string[] = []): string[] {
  if (!value) {
    return acc;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        collectQuotaIds(JSON.parse(trimmed) as unknown, acc);
      } catch {
        return acc;
      }
    }
    return acc;
  }
  if (typeof value !== "object") {
    return acc;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectQuotaIds(item, acc);
    }
    return acc;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.quotaId === "string") {
    acc.push(row.quotaId);
  }
  if (typeof row.quotaMetric === "string") {
    acc.push(row.quotaMetric);
  }
  if (typeof row.responseBody === "string") {
    collectQuotaIds(row.responseBody, acc);
  }
  if (typeof row.data === "string") {
    collectQuotaIds(row.data, acc);
  }
  for (const key of [
    "error",
    "details",
    "violations",
    "cause",
    "data",
  ] as const) {
    if (row[key] && typeof row[key] === "object") {
      collectQuotaIds(row[key], acc);
    }
  }
  return acc;
}

export function isPerDayQuota(ids: string[]): boolean {
  return ids.some((id) => /PerDay/i.test(id) || /per[_-]?day/i.test(id));
}

export function httpStatusOf(error: unknown): number | null {
  if (error instanceof AppError) {
    return error.status;
  }
  if (!error || typeof error !== "object") {
    return null;
  }
  const row = error as { statusCode?: unknown; status?: unknown };
  const statusCode = Number(row.statusCode);
  if (Number.isFinite(statusCode) && statusCode > 0) {
    return statusCode;
  }
  const status = Number(row.status);
  if (Number.isFinite(status) && status > 0) {
    return status;
  }
  return null;
}

export function isHttp429(error: unknown): boolean {
  return httpStatusOf(error) === 429;
}

export function cooldownFrom429(error: unknown, now: Date, jitter01 = 0): Date {
  if (isPerDayQuota(collectQuotaIds(error))) {
    return nextMidnightPacific(now);
  }
  const jitter = Math.min(1, Math.max(0, jitter01));
  return new Date(now.getTime() + 60_000 * (1 + jitter));
}

export function toLaneError(
  decision: Extract<GuardDecision, { ok: false }>,
): AppError {
  if (decision.code === "FORBIDDEN") {
    return new AppError("FORBIDDEN", decision.message);
  }
  const message =
    decision.code === "LANE_CAP"
      ? "本日のレーン上限に達しました"
      : "レーンがクールダウン中です";
  return new AppError(decision.code, message, {
    retryable: true,
    retryAfter: decision.retryAfter.toISOString(),
  });
}

export function isLaneBudgetError(error: unknown): error is AppError {
  return (
    error instanceof AppError &&
    (error.code === "LANE_CAP" || error.code === "LANE_COOLDOWN")
  );
}

export function laneRetryAt(error: unknown, now = new Date()): Date {
  if (error instanceof AppError && error.retryAfter) {
    const at = Date.parse(error.retryAfter);
    if (Number.isFinite(at)) {
      return new Date(at);
    }
  }
  return new Date(now.getTime() + 60_000);
}

export async function guard(lane: Lane, now = new Date()): Promise<void> {
  await ensureSchema();
  const settings = await getAiLaneSettings();
  const usage = await getClient().execute({
    sql: `SELECT COALESCE(SUM(requests), 0) AS requests,
                 MAX(cooldown_until) AS cooldown_until
          FROM ai_usage_daily
          WHERE day_pt = ? AND lane = ?
          LIMIT 1`,
    args: [pacificDay(now), lane],
  });
  const decision = decideCall({
    now,
    used: Number(usage.rows[0]?.requests ?? 0),
    cap: settings.caps[lane],
    cooldownUntil: usage.rows[0]?.cooldown_until
      ? String(usage.rows[0].cooldown_until)
      : null,
    paused: settings.paused,
  });
  if (!decision.ok) {
    throw toLaneError(decision);
  }
}

export async function record(input: {
  lane: Lane;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  now?: Date;
}): Promise<void> {
  await ensureSchema();
  const now = input.now ?? new Date();
  await getClient().execute({
    sql: `INSERT INTO ai_usage_daily
            (day_pt, lane, model, requests, input_tokens, output_tokens, cost_usd)
          VALUES (?, ?, ?, 1, ?, ?, 0)
          ON CONFLICT(day_pt, lane, model) DO UPDATE SET
            requests = requests + 1,
            input_tokens = input_tokens + excluded.input_tokens,
            output_tokens = output_tokens + excluded.output_tokens`,
    args: [
      pacificDay(now),
      input.lane,
      input.model,
      Math.max(0, Math.round(input.inputTokens ?? 0)),
      Math.max(0, Math.round(input.outputTokens ?? 0)),
    ],
  });
}

export async function noteError(
  lane: Lane,
  model: string,
  error: unknown,
  now = new Date(),
  jitter01 = Math.random(),
): Promise<void> {
  await ensureSchema();
  const message = (
    error instanceof Error ? error.message : String(error)
  ).slice(0, 500);
  const cooldown = isHttp429(error)
    ? cooldownFrom429(error, now, jitter01).toISOString()
    : null;
  await getClient().execute({
    sql: `INSERT INTO ai_usage_daily
            (day_pt, lane, model, requests, input_tokens, output_tokens,
             cost_usd, cooldown_until, last_error)
          VALUES (?, ?, ?, 0, 0, 0, 0, ?, ?)
          ON CONFLICT(day_pt, lane, model) DO UPDATE SET
            cooldown_until = COALESCE(excluded.cooldown_until, cooldown_until),
            last_error = excluded.last_error`,
    args: [pacificDay(now), lane, model, cooldown, message],
  });
  logger.warn(
    { lane, model, status: httpStatusOf(error), cooldown },
    "ai lane error",
  );
}

export const budget = {
  guard,
  record,
  noteError,
};
