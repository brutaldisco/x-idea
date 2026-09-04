import { logger } from "@/lib/logger";
import { syncBookmarks } from "@/server/jobs/handlers/syncBookmarks";
import type { JobRow } from "@/server/jobs/types";

export async function runHandler(job: JobRow): Promise<void> {
  const payload = parsePayload(job.payload_json);
  if (job.type === "sync_bookmarks") {
    await syncBookmarks(payload);
    return;
  }
  logger.info({ jobId: job.id, type: job.type }, "job stub");
}

function parsePayload(raw: string): {
  x_account_id?: string;
  trigger?: "schedule" | "manual";
} {
  try {
    const value = JSON.parse(raw) as {
      x_account_id?: string;
      trigger?: "schedule" | "manual";
    };
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
