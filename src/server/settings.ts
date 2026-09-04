import { getClient } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { logger } from "@/lib/logger";

export async function getSyncSettings(): Promise<{
  xApiEnabled: boolean;
  saveReplies: boolean;
}> {
  await ensureSchema();
  const result = await getClient().execute(
    "SELECT x_api_enabled, save_replies FROM settings WHERE id = 1 LIMIT 1",
  );
  const row = result.rows[0];
  return {
    xApiEnabled: Number(row?.x_api_enabled ?? 0) === 1,
    saveReplies: Number(row?.save_replies ?? 1) === 1,
  };
}

export async function getContextSettings(): Promise<{
  xApiEnabled: boolean;
  threadExpandEnabled: boolean;
  replyContextEnabled: boolean;
  monthlyCapUsd: number;
}> {
  await ensureSchema();
  const result = await getClient().execute(
    `SELECT x_api_enabled, thread_expand_enabled, reply_context_enabled,
            thread_expand_monthly_cap_usd
     FROM settings WHERE id = 1 LIMIT 1`,
  );
  const row = result.rows[0];
  return {
    xApiEnabled: Number(row?.x_api_enabled ?? 0) === 1,
    threadExpandEnabled: Number(row?.thread_expand_enabled ?? 0) === 1,
    replyContextEnabled: Number(row?.reply_context_enabled ?? 0) === 1,
    monthlyCapUsd: Number(row?.thread_expand_monthly_cap_usd ?? 2),
  };
}

export async function setXApiEnabled(enabled: boolean): Promise<void> {
  await ensureSchema();
  await getClient().execute({
    sql: "UPDATE settings SET x_api_enabled = ?, updated_at = datetime('now') WHERE id = 1",
    args: [enabled ? 1 : 0],
  });
  logger.info({ enabled }, "settings.x_api_enabled updated");
}

export async function setPaidFlag(
  column: "thread_expand_enabled" | "reply_context_enabled",
  enabled: boolean,
): Promise<void> {
  await ensureSchema();
  const allowed = new Set(["thread_expand_enabled", "reply_context_enabled"]);
  if (!allowed.has(column)) {
    throw new Error("invalid settings column");
  }
  await getClient().execute({
    sql: `UPDATE settings SET ${column} = ?, updated_at = datetime('now') WHERE id = 1`,
    args: [enabled ? 1 : 0],
  });
  logger.info({ column, enabled }, "settings paid flag updated");
}
