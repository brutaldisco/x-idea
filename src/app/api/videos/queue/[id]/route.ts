import { connection } from "next/server";
import { ensureSchema } from "@/db/ensure";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { markVideoDownloading, updateVideoQueue } from "@/server/videos/queue";
import { getAccountContext } from "@/server/x/context";

export const instant = false;

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
    await ensureSchema();
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      error?: string;
    };
    const ctx = await getAccountContext();
    if (body.action === "start") {
      await markVideoDownloading(id, ctx);
      return Response.json({ ok: true, status: "downloading" });
    }
    if (
      body.action !== "cancel" &&
      body.action !== "retry" &&
      body.action !== "fail"
    ) {
      return Response.json(
        toErrorBody(new AppError("VALIDATION", "action が不正です")),
        { status: 400 },
      );
    }
    const item = await updateVideoQueue(id, ctx, body.action, body.error);
    return Response.json({ ok: true, item });
  } catch (error) {
    const body = toErrorBody(error);
    const status = error instanceof AppError ? error.status : 500;
    return Response.json(body, { status });
  }
}
