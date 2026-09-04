import { connection } from "next/server";
import { getClient } from "@/db/client";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { enqueueJob } from "@/server/jobs/queue";
import { runJobs } from "@/server/jobs/runner";
import {
  confirmMediaDownload,
  markMediaSkipped,
} from "@/server/media/download";

export const instant = false;
export const maxDuration = 60;

async function accountIdForMedia(mediaId: string): Promise<string | null> {
  const result = await getClient().execute({
    sql: `SELECT COALESCE(s.x_account_id, (
            SELECT x_account_id FROM sources
            WHERE x_post_id IN (
              SELECT x_post_id FROM media_assets WHERE id = ? LIMIT 1
            ) LIMIT 1
          )) AS account_id
          FROM media_assets m
          JOIN x_posts p ON p.id = m.x_post_id
          LEFT JOIN sources s ON s.x_post_id = p.id
          WHERE m.id = ?
          LIMIT 1`,
    args: [mediaId, mediaId],
  });
  return result.rows[0]?.account_id ? String(result.rows[0].account_id) : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
    };
    const accountId = await accountIdForMedia(id);
    if (!accountId) {
      return Response.json(
        toErrorBody(new AppError("NOT_FOUND", "メディアがありません")),
        { status: 404 },
      );
    }
    if (body.action === "skip") {
      await markMediaSkipped(id);
      return Response.json({ ok: true, status: "skipped" });
    }
    await confirmMediaDownload({ mediaId: id, accountId });
    await enqueueJob({
      type: "media_download",
      payload: { media_id: id, account_id: accountId, force: true },
      dedupeKey: `media_download:${id}:force`,
      timeoutSec: 1800,
    });
    const result = await runJobs({ max: 2 });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
