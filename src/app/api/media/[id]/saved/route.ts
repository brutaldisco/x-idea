import { connection } from "next/server";
import { getClient } from "@/db/client";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { isSafeRelativeMediaPath } from "@/server/media/companion";

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
    const { id } = await context.params;
    const body = (await request.json()) as {
      local_path?: string;
      bytes?: number;
    };
    const path = body.local_path ?? "";
    const bytes = Number(body.bytes ?? 0);
    if (
      !isSafeRelativeMediaPath(path) ||
      !Number.isFinite(bytes) ||
      bytes < 0
    ) {
      return Response.json(
        toErrorBody(new AppError("VALIDATION", "保存パスが不正です")),
        { status: 400 },
      );
    }
    await getClient().execute({
      sql: `UPDATE media_assets SET
        download_status = 'ready',
        local_path = ?,
        local_bytes = ?,
        download_error = NULL,
        downloaded_at = datetime('now')
        WHERE id = ?`,
      args: [path, Math.round(bytes), id],
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
