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

export async function setXApiEnabled(enabled: boolean): Promise<void> {
  await ensureSchema();
  await getClient().execute({
    sql: "UPDATE settings SET x_api_enabled = ?, updated_at = datetime('now') WHERE id = 1",
    args: [enabled ? 1 : 0],
  });
  logger.info({ enabled }, "settings.x_api_enabled updated");
}
