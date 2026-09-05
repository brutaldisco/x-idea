import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";
import { after, connection } from "next/server";
import { getClient } from "@/db/client";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { accountIdForMedia } from "@/server/media/account";
import { downloadMediaAsset, loadMediaRow } from "@/server/media/download";
import { proxyRemoteMedia } from "@/server/media/fetch-remote";
import { isLocalMediaEnabled, resolveMediaPath } from "@/server/media/paths";
import { refreshMediaFromTweet } from "@/server/media/refresh";
import {
  contentTypeForExt,
  downloadUrlFor,
  parseVariantsJson,
  remoteUrlFor,
} from "@/server/media/select";

export const instant = false;
export const maxDuration = 60;

function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header?.startsWith("bytes=")) {
    return null;
  }
  const [startRaw, endRaw] = header.slice(6).split("-");
  const start = startRaw ? Number(startRaw) : 0;
  const end = endRaw ? Number(endRaw) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return null;
  }
  return { start: Math.max(0, start), end: Math.min(size - 1, end) };
}

async function serveLocal(
  localPath: string,
  rangeHeader: string | null,
): Promise<Response> {
  const abs = resolveMediaPath(localPath);
  const info = await stat(abs);
  const type = contentTypeForExt(extname(abs));
  const range = parseRange(rangeHeader, info.size);
  if (range) {
    const stream = createReadStream(abs, {
      start: range.start,
      end: range.end,
    });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, immutable",
      },
    });
  }
  const stream = createReadStream(abs);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(info.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, immutable",
    },
  });
}

function schedulePersist(mediaId: string): void {
  if (!isLocalMediaEnabled()) {
    return;
  }
  after(async () => {
    try {
      const accountId = await accountIdForMedia(mediaId);
      if (!accountId) {
        return;
      }
      await downloadMediaAsset({ mediaId, accountId });
    } catch (error) {
      logger.warn({ err: error, mediaId }, "background media persist failed");
    }
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  try {
    const { id } = await context.params;
    const previewOnly =
      new URL(request.url).searchParams.get("preview") === "1";
    const rangeHeader = request.headers.get("range");
    const result = await getClient().execute({
      sql: `SELECT download_status, local_path, media_url, preview_url, type,
                   variants_json
            FROM media_assets WHERE id = ? LIMIT 1`,
      args: [id],
    });
    const row = result.rows[0];
    if (!row) {
      return Response.json(
        toErrorBody(new AppError("NOT_FOUND", "メディアがありません")),
        { status: 404 },
      );
    }

    const status = String(row.download_status ?? "");
    const localPath = row.local_path ? String(row.local_path) : null;
    const type = String(row.type ?? "photo");
    const canServeLocal = status === "ready" && localPath;
    if (canServeLocal && localPath) {
      return serveLocal(localPath, rangeHeader);
    }

    if (!previewOnly && type !== "photo") {
      return Response.json(
        toErrorBody(
          new AppError("NOT_FOUND", "動画はこのアプリでは再生しません"),
        ),
        { status: 404 },
      );
    }

    const mediaUrl = row.media_url ? String(row.media_url) : null;
    const previewUrl = row.preview_url ? String(row.preview_url) : null;
    const variants = parseVariantsJson(
      row.variants_json ? String(row.variants_json) : null,
    );
    let url = remoteUrlFor({
      type,
      media_url: mediaUrl,
      preview_url: previewUrl,
      variants,
      previewOnly,
    });

    if (
      !previewOnly &&
      type === "photo" &&
      !downloadUrlFor({ type, media_url: mediaUrl, variants })
    ) {
      const accountId = await accountIdForMedia(id);
      if (accountId) {
        await refreshMediaFromTweet({ mediaId: id, accountId });
        const fresh = await loadMediaRow(id);
        if (fresh) {
          url = remoteUrlFor({
            type: fresh.type,
            media_url: fresh.media_url,
            preview_url: fresh.preview_url,
            variants: parseVariantsJson(fresh.variants_json),
          });
        }
      }
    }
    if (previewOnly && !url) {
      const accountId = await accountIdForMedia(id);
      if (accountId) {
        await refreshMediaFromTweet({ mediaId: id, accountId });
        const fresh = await loadMediaRow(id);
        if (fresh) {
          url = remoteUrlFor({
            type: fresh.type,
            media_url: fresh.media_url,
            preview_url: fresh.preview_url,
            variants: parseVariantsJson(fresh.variants_json),
            previewOnly: true,
          });
        }
      }
    }

    if (!url) {
      return Response.json(
        toErrorBody(new AppError("NOT_FOUND", "メディアURLがありません")),
        { status: 404 },
      );
    }

    schedulePersist(id);
    return proxyRemoteMedia(url, rangeHeader, "image/jpeg");
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
