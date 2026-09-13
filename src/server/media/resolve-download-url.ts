import { AppError } from "@/lib/errors";
import { accountIdForMedia } from "@/server/media/account";
import { loadMediaRow, type MediaRow } from "@/server/media/download";
import { refreshMediaFromTweet } from "@/server/media/refresh";
import { downloadUrlFor, parseVariantsJson } from "@/server/media/select";

export type ResolvedVideoDownload =
  | { ok: true; row: MediaRow; url: string }
  | { ok: false; error: AppError };

function urlForRow(row: MediaRow): string | null {
  return downloadUrlFor({
    type: row.type,
    media_url: row.media_url,
    variants: parseVariantsJson(row.variants_json),
  });
}

/**
 * 動画の mp4 URL を解決する。variants が無ければポストを取り直して補完する。
 * `/api/media/[id]/file`（プロキシ配信）と `/api/media/[id]/url`
 * （CDN 直接ダウンロード用、ADR-021）の共通ロジック。
 */
export async function resolveVideoDownloadUrl(
  mediaId: string,
): Promise<ResolvedVideoDownload> {
  let row = await loadMediaRow(mediaId);
  if (!row || row.type === "photo") {
    return {
      ok: false,
      error: new AppError("NOT_FOUND", "動画がありません"),
    };
  }
  let url = urlForRow(row);
  if (!url) {
    const accountId = await accountIdForMedia(mediaId);
    if (accountId) {
      await refreshMediaFromTweet({ mediaId, accountId });
      row = await loadMediaRow(mediaId);
      if (row) {
        url = urlForRow(row);
      }
    }
  }
  if (!row || !url) {
    return {
      ok: false,
      error: new AppError(
        "VALIDATION",
        "この動画は保存できません（mp4 がありません）",
        { status: 422 },
      ),
    };
  }
  return { ok: true, row, url };
}
