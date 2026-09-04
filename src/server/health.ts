import { getClient, isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { logger } from "@/lib/logger";
import { sourceScopeSql } from "@/server/sources/scope";
import { type AccountContext, contextAccountId } from "@/server/x/context";

export type HealthPayload = {
  ok: true;
  app: "marginalia";
  db: "ok" | "unconfigured" | "error";
  last_synced_at: string | null;
  pending_jobs: number;
  inbox_count: number;
  x_connected: boolean;
  x_api_enabled: boolean;
  ai_paid_enabled: boolean;
  ai_budget: {
    bulk: { used: number; cap: number };
    quality: { used: number; cap: number };
    embed: { used: number; cap: number };
  };
};

const EMPTY_BUDGET = {
  bulk: { used: 0, cap: 400 },
  quality: { used: 0, cap: 16 },
  embed: { used: 0, cap: 800 },
};

function pacificDay(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export async function getHealth(ctx?: AccountContext): Promise<HealthPayload> {
  const base: HealthPayload = {
    ok: true,
    app: "marginalia",
    db: "unconfigured",
    last_synced_at: null,
    pending_jobs: 0,
    inbox_count: 0,
    x_connected: false,
    x_api_enabled: false,
    ai_paid_enabled: false,
    ai_budget: EMPTY_BUDGET,
  };

  if (!isDbConfigured()) {
    return base;
  }

  const accountId = ctx ? contextAccountId(ctx) : null;

  try {
    await ensureSchema();
    const client = getClient();

    const inboxScope = sourceScopeSql(accountId);
    const inboxSql = `SELECT COUNT(*) AS n FROM sources WHERE triage_status = 'needs_review' AND ${inboxScope.clause} LIMIT 1`;
    const inboxArgs = inboxScope.args;

    const accountSql = accountId
      ? "SELECT last_synced_at, COUNT(*) AS n FROM x_account WHERE id = ? LIMIT 1"
      : "SELECT MAX(last_synced_at) AS last_synced_at, COUNT(*) AS n FROM x_account LIMIT 1";
    const accountArgs = accountId ? [accountId] : [];

    const [settings, pending, inbox, account, usage] = await Promise.all([
      client.execute(
        "SELECT x_api_enabled, ai_paid_enabled, ai_lane_caps_json FROM settings WHERE id = 1 LIMIT 1",
      ),
      client.execute(
        "SELECT COUNT(*) AS n FROM jobs WHERE status = 'pending' LIMIT 1",
      ),
      client.execute({ sql: inboxSql, args: inboxArgs }),
      client.execute({ sql: accountSql, args: accountArgs }),
      client.execute({
        sql: "SELECT lane, requests FROM ai_usage_daily WHERE day_pt = ? LIMIT 16",
        args: [pacificDay()],
      }),
    ]);

    const row = settings.rows[0];
    let caps = EMPTY_BUDGET;
    try {
      const parsed = JSON.parse(String(row?.ai_lane_caps_json ?? "{}")) as {
        bulk?: number;
        quality?: number;
        embed?: number;
      };
      caps = {
        bulk: { used: 0, cap: parsed.bulk ?? 400 },
        quality: { used: 0, cap: parsed.quality ?? 16 },
        embed: { used: 0, cap: parsed.embed ?? 800 },
      };
    } catch {
      caps = EMPTY_BUDGET;
    }

    for (const used of usage.rows) {
      const lane = String(used.lane);
      if (lane === "bulk" || lane === "quality" || lane === "embed") {
        caps[lane].used = Number(used.requests);
      }
    }

    return {
      ...base,
      db: "ok",
      last_synced_at: account.rows[0]?.last_synced_at
        ? String(account.rows[0].last_synced_at)
        : null,
      pending_jobs: Number(pending.rows[0]?.n ?? 0),
      inbox_count: Number(inbox.rows[0]?.n ?? 0),
      x_connected: Number(account.rows[0]?.n ?? 0) > 0,
      x_api_enabled: Number(row?.x_api_enabled ?? 0) === 1,
      ai_paid_enabled: Number(row?.ai_paid_enabled ?? 0) === 1,
      ai_budget: caps,
    };
  } catch (error) {
    logger.error({ err: error }, "health db error");
    return { ...base, db: "error" };
  }
}
