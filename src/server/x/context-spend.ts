import { getClient } from "@/db/client";
import { newId } from "@/lib/ids";
import { getContextSettings } from "@/server/settings";
import { estimatePostReadUsd } from "@/server/usage/estimate";

export async function monthContextSpendUsd(): Promise<number> {
  const result = await getClient().execute(
    `SELECT COALESCE(SUM(est_cost_usd), 0) AS n FROM sync_runs
     WHERE mode IN ('thread', 'reply_context')
       AND started_at >= datetime('now', 'start of month')
     LIMIT 1`,
  );
  return Number(result.rows[0]?.n ?? 0);
}

export async function canSpendContext(extraUsd: number): Promise<boolean> {
  const settings = await getContextSettings();
  const spent = await monthContextSpendUsd();
  return spent + extraUsd <= settings.monthlyCapUsd + 1e-9;
}

export async function writeContextRun(input: {
  accountId: string;
  mode: "parent" | "thread" | "reply_context";
  resources: number;
  status: string;
  error?: string | null;
}): Promise<void> {
  await getClient().execute({
    sql: `INSERT INTO sync_runs (
      id, x_account_id, trigger, mode, status, new_sources, pages_fetched,
      resources_read, est_cost_usd, error_message, started_at, finished_at
    ) VALUES (?, ?, 'schedule', ?, ?, 0, 1, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: [
      newId(),
      input.accountId,
      input.mode,
      input.status,
      input.resources,
      estimatePostReadUsd(input.resources),
      input.error ?? null,
    ],
  });
}
