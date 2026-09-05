import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { enqueueJob } from "@/server/jobs/queue";
import { runJobs } from "@/server/jobs/runner";
import { accountIdForMedia } from "@/server/media/account";
import {
  confirmMediaDownload,
  markMediaSkipped,
} from "@/server/media/download";

export const instant = false;
export const maxDuration = 60;

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
