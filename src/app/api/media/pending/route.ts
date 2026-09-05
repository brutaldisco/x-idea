import { connection } from "next/server";
import { getClient, isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { relativeMediaPath } from "@/server/media/paths";
import { contextAccountId, getAccountContext } from "@/server/x/context";

export const instant = false;

export async function GET(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  if (!isDbConfigured()) {
    return Response.json({ items: [] });
  }
  await ensureSchema();
  const ctx = await getAccountContext();
  const accountId = contextAccountId(ctx);
  if (!accountId) {
    return Response.json({ items: [] });
  }
  const result = await getClient().execute({
    sql: `SELECT m.id, m.type, m.media_key, p.tweet_id, s.x_account_id
          FROM media_assets m
          JOIN x_posts p ON p.id = m.x_post_id
          LEFT JOIN sources s ON s.x_post_id = p.id
          WHERE m.download_status IN ('pending', 'failed')
            AND (m.type = 'photo' OR m.preview_url IS NOT NULL)
            AND (s.x_account_id = ? OR s.x_account_id IS NULL)
          ORDER BY m.created_at DESC
          LIMIT 20`,
    args: [accountId],
  });
  const items = result.rows.flatMap((row) => {
    const acc = row.x_account_id ? String(row.x_account_id) : accountId;
    const tweetId = row.tweet_id ? String(row.tweet_id) : "";
    const mediaKey = row.media_key ? String(row.media_key) : "";
    if (!acc || !tweetId || !mediaKey) {
      return [];
    }
    const type = String(row.type);
    return [
      {
        id: String(row.id),
        type: "photo",
        kind: type,
        persistPath: relativeMediaPath({
          accountId: acc,
          tweetId,
          mediaKey,
          ext: ".webp",
        }),
      },
    ];
  });
  return Response.json({ items });
}
