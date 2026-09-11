import { getClient } from "@/db/client";
import { enqueueJob } from "@/server/jobs/queue";

/** runner の 1 tick 上限（5）に合わせ、数 tick 分だけ先に積む */
export const MEDIA_QUEUE_TARGET = 15;

export async function enqueuePendingMediaDownloads(
  accountId: string,
): Promise<number> {
  const room = MEDIA_QUEUE_TARGET - (await countQueuedMediaDownloads());
  if (room <= 0) {
    return 0;
  }
  const result = await getClient().execute({
    sql: `SELECT m.id FROM media_assets m
          JOIN x_posts p ON p.id = m.x_post_id
          LEFT JOIN sources s ON s.x_post_id = p.id
          WHERE m.download_status IN ('pending', 'failed')
            AND (s.x_account_id = ? OR s.x_account_id IS NULL)
          ORDER BY m.created_at DESC
          LIMIT ?`,
    args: [accountId, room],
  });
  let n = 0;
  for (const row of result.rows) {
    const inserted = await enqueueJob({
      type: "media_download",
      payload: { media_id: String(row.id), account_id: accountId },
      dedupeKey: `media_download:${row.id}`,
      timeoutSec: 1800,
    });
    if (inserted) {
      n += 1;
    }
  }
  return n;
}

async function countQueuedMediaDownloads(): Promise<number> {
  const result = await getClient().execute({
    sql: `SELECT COUNT(*) AS n FROM jobs
          WHERE type = 'media_download'
            AND status IN ('pending', 'running')
          LIMIT 1`,
  });
  return Number(result.rows[0]?.n ?? 0);
}
