import { getClient } from "@/db/client";

export async function accountIdForMedia(
  mediaId: string,
): Promise<string | null> {
  const result = await getClient().execute({
    sql: `SELECT COALESCE(
            (SELECT s.x_account_id FROM sources s
             WHERE s.x_post_id = m.x_post_id LIMIT 1),
            (SELECT id FROM x_account WHERE status = 'active'
             ORDER BY created_at ASC LIMIT 1)
          ) AS account_id
          FROM media_assets m
          WHERE m.id = ?
          LIMIT 1`,
    args: [mediaId],
  });
  return result.rows[0]?.account_id ? String(result.rows[0].account_id) : null;
}
