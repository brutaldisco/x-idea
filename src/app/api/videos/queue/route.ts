import { connection } from "next/server";
import { ensureSchema } from "@/db/ensure";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import {
  enqueueSourceVideos,
  enqueueVideo,
  listVideoLibrary,
} from "@/server/videos/queue";
import { getAccountContext } from "@/server/x/context";

export const instant = false;

export async function GET(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  await ensureSchema();
  const ctx = await getAccountContext();
  return Response.json(await listVideoLibrary(ctx));
}

export async function POST(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    await ensureSchema();
    const body = (await request.json().catch(() => ({}))) as {
      media_id?: string;
      source_id?: string;
    };
    const mediaId = body.media_id?.trim() ?? "";
    const sourceId = body.source_id?.trim() ?? "";
    if (!mediaId && !sourceId) {
      return Response.json(
        toErrorBody(
          new AppError("VALIDATION", "media_id または source_id が必要です"),
        ),
        { status: 400 },
      );
    }
    const ctx = await getAccountContext();
    if (sourceId) {
      const result = await enqueueSourceVideos(sourceId, ctx);
      return Response.json({ ok: true, ...result });
    }
    const item = await enqueueVideo(mediaId, ctx);
    return Response.json({ ok: true, item });
  } catch (error) {
    const body = toErrorBody(error);
    const status = error instanceof AppError ? error.status : 500;
    return Response.json(body, { status });
  }
}
