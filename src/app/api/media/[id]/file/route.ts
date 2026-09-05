import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { accountIdForMedia } from "@/server/media/account";
import { loadMediaRow } from "@/server/media/download";
import { proxyRemoteMedia } from "@/server/media/fetch-remote";
import { refreshMediaFromTweet } from "@/server/media/refresh";
import { downloadUrlFor, parseVariantsJson } from "@/server/media/select";

export const instant = false;
export const maxDuration = 300;

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
    let row = await loadMediaRow(id);
    if (!row || row.type === "photo") {
      return Response.json(
        toErrorBody(new AppError("NOT_FOUND", "動画がありません")),
        { status: 404 },
      );
    }
    let url = downloadUrlFor({
      type: row.type,
      media_url: row.media_url,
      variants: parseVariantsJson(row.variants_json),
    });
    if (!url) {
      const accountId = await accountIdForMedia(id);
      if (accountId) {
        await refreshMediaFromTweet({ mediaId: id, accountId });
        row = await loadMediaRow(id);
        if (row) {
          url = downloadUrlFor({
            type: row.type,
            media_url: row.media_url,
            variants: parseVariantsJson(row.variants_json),
          });
        }
      }
    }
    if (!url) {
      return Response.json(
        toErrorBody(
          new AppError(
            "VALIDATION",
            "この動画は保存できません（mp4 がありません）",
            { status: 422 },
          ),
        ),
        { status: 422 },
      );
    }
    const range = request.headers.get("range");
    const proxied = await proxyRemoteMedia(url, range, "video/mp4");
    const headers = new Headers(proxied.headers);
    const filename = `${row?.tweet_id ?? "video"}_${row?.media_key ?? "media"}.mp4`;
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    return new Response(proxied.body, {
      status: proxied.status,
      headers,
    });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
