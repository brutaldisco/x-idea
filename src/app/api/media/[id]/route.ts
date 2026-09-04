import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { Readable } from "node:stream";
import { connection } from "next/server";
import { getClient } from "@/db/client";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveMediaPath } from "@/server/media/paths";
import { contentTypeForExt } from "@/server/media/select";

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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  try {
    const { id } = await context.params;
    const result = await getClient().execute({
      sql: `SELECT download_status, local_path, media_url, preview_url
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
    if (status === "ready" && localPath) {
      const abs = resolveMediaPath(localPath);
      const info = await stat(abs);
      const ext = extname(abs);
      const type = contentTypeForExt(ext);
      const range = parseRange(request.headers.get("range"), info.size);
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

    const fallback =
      (row.media_url ? String(row.media_url) : null) ||
      (row.preview_url ? String(row.preview_url) : null);
    if (fallback) {
      return Response.redirect(fallback, 302);
    }
    return Response.json(
      toErrorBody(new AppError("NOT_FOUND", "メディアURLがありません")),
      { status: 404 },
    );
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
