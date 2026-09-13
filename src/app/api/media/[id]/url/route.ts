import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { resolveVideoDownloadUrl } from "@/server/media/resolve-download-url";

/**
 * 動画の CDN URL を返す。ブラウザから video.twimg.com へ直接 Range 取得する
 * 並列ダウンロード用（ADR-021）。URL 自体は認証不要の公開 CDN リンク。
 */
export async function GET(
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
    const resolved = await resolveVideoDownloadUrl(id);
    if (!resolved.ok) {
      return Response.json(toErrorBody(resolved.error), {
        status: resolved.error.status,
      });
    }
    return Response.json({ url: resolved.url });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
