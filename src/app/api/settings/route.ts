import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { setPaidFlag, setSyncLimits, setXApiEnabled } from "@/server/settings";

export const instant = false;

export async function PATCH(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    const body = (await request.json()) as {
      x_api_enabled?: boolean;
      thread_expand_enabled?: boolean;
      reply_context_enabled?: boolean;
      sync_max_per_run?: number;
      media_download_per_tick?: number;
    };
    if (typeof body.x_api_enabled === "boolean") {
      await setXApiEnabled(body.x_api_enabled);
      return Response.json({ ok: true });
    }
    if (typeof body.thread_expand_enabled === "boolean") {
      await setPaidFlag("thread_expand_enabled", body.thread_expand_enabled);
      return Response.json({ ok: true });
    }
    if (typeof body.reply_context_enabled === "boolean") {
      await setPaidFlag("reply_context_enabled", body.reply_context_enabled);
      return Response.json({ ok: true });
    }
    if (
      typeof body.sync_max_per_run === "number" ||
      typeof body.media_download_per_tick === "number"
    ) {
      await setSyncLimits({
        syncMaxPerRun: body.sync_max_per_run,
        mediaDownloadPerTick: body.media_download_per_tick,
      });
      return Response.json({ ok: true });
    }
    return Response.json(
      toErrorBody(new AppError("VALIDATION", "更新する項目が必要です")),
      { status: 400 },
    );
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
