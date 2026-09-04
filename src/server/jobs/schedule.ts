import { getClient } from "@/db/client";
import { nextRunAfter } from "@/lib/cron";
import { logger } from "@/lib/logger";
import { enqueueJob } from "@/server/jobs/queue";

type ScheduleRow = {
  key: string;
  job_type: string;
  cron_expr: string;
  tz: string;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
};

const SKIP_WHEN_X_OFF = new Set(["sync_bookmarks", "sync_folders"]);

export async function evaluateSchedules(now = new Date()): Promise<string[]> {
  const client = getClient();
  const settings = await client.execute(
    "SELECT x_api_enabled FROM settings WHERE id = 1 LIMIT 1",
  );
  const xApiEnabled = Number(settings.rows[0]?.x_api_enabled ?? 0) === 1;

  const listed = await client.execute(
    "SELECT key, job_type, cron_expr, tz, enabled, last_run_at, next_run_at FROM job_schedules LIMIT 32",
  );
  const enqueued: string[] = [];

  for (const raw of listed.rows) {
    const row = raw as unknown as ScheduleRow;
    if (!row.enabled) {
      continue;
    }
    const tz = row.tz || "Asia/Tokyo";
    if (!row.next_run_at) {
      await client.execute({
        sql: "UPDATE job_schedules SET next_run_at = ? WHERE key = ?",
        args: [nextRunAfter(row.cron_expr, now, tz).toISOString(), row.key],
      });
      continue;
    }
    if (new Date(row.next_run_at) > now) {
      continue;
    }
    if (SKIP_WHEN_X_OFF.has(row.job_type) && !xApiEnabled) {
      await client.execute({
        sql: "UPDATE job_schedules SET next_run_at = ? WHERE key = ?",
        args: [nextRunAfter(row.cron_expr, now, tz).toISOString(), row.key],
      });
      continue;
    }
    if (row.job_type === "sync_bookmarks") {
      const enabled = await client.execute(
        "SELECT COUNT(*) AS n FROM x_account WHERE sync_enabled = 1 LIMIT 1",
      );
      if (Number(enabled.rows[0]?.n ?? 0) === 0) {
        await client.execute({
          sql: "UPDATE job_schedules SET next_run_at = ? WHERE key = ?",
          args: [nextRunAfter(row.cron_expr, now, tz).toISOString(), row.key],
        });
        continue;
      }
    }

    const inserted = await enqueueJob({
      type: row.job_type,
      dedupeKey: `${row.key}:${row.next_run_at}`,
    });
    await client.execute({
      sql: "UPDATE job_schedules SET last_run_at = ?, next_run_at = ? WHERE key = ?",
      args: [
        now.toISOString(),
        nextRunAfter(row.cron_expr, now, tz).toISOString(),
        row.key,
      ],
    });
    if (inserted) {
      enqueued.push(row.job_type);
    }
  }

  if (enqueued.length > 0) {
    logger.info({ enqueued }, "schedules enqueued");
  }
  return enqueued;
}
