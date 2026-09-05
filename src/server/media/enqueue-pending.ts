import { getClient } from "@/db/client";
import { enqueueJob } from "@/server/jobs/queue";

export async function enqueuePendingMediaDownloads(
  accountId: string,
  limit = 40,
): Promise<number> {
  const result = await getClient().execute({
    sql: `SELECT m.id FROM media_assets m
          JOIN x_posts p ON p.id = m.x_post_id
          LEFT JOIN sources s ON s.x_post_id = p.id
          WHERE m.download_status IN ('pending', 'failed')
            AND (s.x_account_id = ? OR s.x_account_id IS NULL)
          ORDER BY m.created_at DESC
          LIMIT ?`,
    args: [accountId, limit],
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
