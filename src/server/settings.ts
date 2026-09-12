import { getClient } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { clampSyncIntervalMin } from "@/lib/sync-policy";
import { type Lane, parseLaneCaps, parseLaneModels } from "@/server/ai/lanes";

export async function getSyncSettings(): Promise<{
  xApiEnabled: boolean;
  saveReplies: boolean;
  syncMaxPerRun: number;
  syncIntervalMin: number;
}> {
  await ensureSchema();
  const result = await getClient().execute(
    `SELECT x_api_enabled, save_replies, sync_max_per_run, sync_interval_min
     FROM settings WHERE id = 1 LIMIT 1`,
  );
  const row = result.rows[0];
  return {
    xApiEnabled: Number(row?.x_api_enabled ?? 0) === 1,
    saveReplies: Number(row?.save_replies ?? 1) === 1,
    syncMaxPerRun: Number(row?.sync_max_per_run ?? 100),
    syncIntervalMin: clampSyncIntervalMin(
      Number(row?.sync_interval_min ?? 360),
    ),
  };
}

export async function getExcludedDomains(): Promise<string[]> {
  await ensureSchema();
  const result = await getClient().execute(
    "SELECT excluded_domains_json FROM settings WHERE id = 1 LIMIT 1",
  );
  try {
    const parsed = JSON.parse(
      String(result.rows[0]?.excluded_domains_json ?? "[]"),
    );
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export async function getAiLaneSettings(): Promise<{
  paused: boolean;
  paidEnabled: boolean;
  models: Record<Lane, string>;
  caps: Record<Lane, number>;
}> {
  await ensureSchema();
  const result = await getClient().execute(
    `SELECT ai_paused, ai_paid_enabled, ai_models_json, ai_lane_caps_json
     FROM settings WHERE id = 1 LIMIT 1`,
  );
  const row = result.rows[0];
  return {
    paused: Number(row?.ai_paused ?? 0) === 1,
    paidEnabled: Number(row?.ai_paid_enabled ?? 0) === 1,
    models: parseLaneModels(row?.ai_models_json),
    caps: parseLaneCaps(row?.ai_lane_caps_json),
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

export async function setSyncLimits(input: {
  syncMaxPerRun?: number;
}): Promise<void> {
  await ensureSchema();
  if (typeof input.syncMaxPerRun !== "number") {
    return;
  }
  const value = Math.max(10, Math.min(500, Math.round(input.syncMaxPerRun)));
  await getClient().execute({
    sql: "UPDATE settings SET sync_max_per_run = ?, updated_at = datetime('now') WHERE id = 1",
    args: [value],
  });
  logger.info({ value }, "settings.sync_max_per_run updated");
}

export async function setXApiEnabled(enabled: boolean): Promise<void> {
  await ensureSchema();
  await getClient().execute({
    sql: "UPDATE settings SET x_api_enabled = ?, updated_at = datetime('now') WHERE id = 1",
    args: [enabled ? 1 : 0],
  });
  logger.info({ enabled }, "settings.x_api_enabled updated");
}

export async function getVideoSaveFolderName(
  accountId: string,
): Promise<string | null> {
  await ensureSchema();
  const result = await getClient().execute({
    sql: "SELECT video_save_folder_name FROM x_account WHERE id = ? LIMIT 1",
    args: [accountId],
  });
  const raw = result.rows[0]?.video_save_folder_name;
  return raw ? String(raw) : null;
}

export async function setVideoSaveFolderName(
  accountId: string,
  name: string,
): Promise<void> {
  await ensureSchema();
  const value = name.trim().slice(0, 255);
  if (!value) {
    throw new Error("folder name required");
  }
  await getClient().execute({
    sql: `UPDATE x_account
          SET video_save_folder_name = ?, updated_at = datetime('now')
          WHERE id = ?`,
    args: [value, accountId],
  });
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

export async function getDefaultXAccountId(): Promise<string | null> {
  await ensureSchema();
  const result = await getClient().execute(
    "SELECT default_x_account_id FROM settings WHERE id = 1 LIMIT 1",
  );
  const raw = result.rows[0]?.default_x_account_id;
  return raw ? String(raw) : null;
}

export async function setDefaultXAccountId(id: string): Promise<void> {
  await ensureSchema();
  const client = getClient();
  const found = await client.execute({
    sql: "SELECT id FROM x_account WHERE id = ? LIMIT 1",
    args: [id],
  });
  if (!found.rows[0]) {
    throw new AppError("VALIDATION", "アカウントが見つかりません");
  }
  await client.execute({
    sql: `UPDATE settings SET default_x_account_id = ?, updated_at = datetime('now')
          WHERE id = 1`,
    args: [id],
  });
  logger.info({ id }, "settings.default_x_account_id updated");
}

export async function clearDefaultXAccountIf(id: string): Promise<void> {
  await ensureSchema();
  await getClient().execute({
    sql: `UPDATE settings SET default_x_account_id = NULL, updated_at = datetime('now')
          WHERE id = 1 AND default_x_account_id = ?`,
    args: [id],
  });
}
