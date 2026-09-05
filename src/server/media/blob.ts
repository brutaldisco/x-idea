import { getClient } from "@/db/client";
import { ensureSchema } from "@/db/ensure";

export const MAX_BLOB_BYTES = 20 * 1024 * 1024;

export type MediaBlob = {
  mediaId: string;
  contentType: string;
  data: Uint8Array;
  bytes: number;
};

function asBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return new Uint8Array(value);
  }
  return null;
}

export async function hasMediaBlob(mediaId: string): Promise<boolean> {
  const result = await getClient().execute({
    sql: "SELECT 1 AS ok FROM media_blobs WHERE media_id = ? LIMIT 1",
    args: [mediaId],
  });
  return Boolean(result.rows[0]);
}

export async function loadMediaBlob(
  mediaId: string,
): Promise<MediaBlob | null> {
  const result = await getClient().execute({
    sql: `SELECT media_id, content_type, data, bytes
          FROM media_blobs WHERE media_id = ? LIMIT 1`,
    args: [mediaId],
  });
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  const data = asBytes(row.data);
  if (!data) {
    return null;
  }
  return {
    mediaId: String(row.media_id),
    contentType: String(row.content_type ?? "image/webp"),
    data,
    bytes: Number(row.bytes ?? data.byteLength),
  };
}

export async function saveMediaBlob(input: {
  mediaId: string;
  contentType?: string;
  data: Uint8Array;
}): Promise<number> {
  if (input.data.byteLength === 0) {
    throw new Error("empty blob");
  }
  if (input.data.byteLength > MAX_BLOB_BYTES) {
    throw new Error("blob too large");
  }
  await getClient().execute({
    sql: `INSERT INTO media_blobs (media_id, content_type, data, bytes, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(media_id) DO UPDATE SET
            content_type = excluded.content_type,
            data = excluded.data,
            bytes = excluded.bytes`,
    args: [
      input.mediaId,
      input.contentType ?? "image/webp",
      input.data,
      input.data.byteLength,
    ],
  });
  return input.data.byteLength;
}

export async function getMediaBlobUsage(): Promise<{
  count: number;
  bytes: number;
}> {
  await ensureSchema();
  const result = await getClient().execute(
    "SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes FROM media_blobs LIMIT 1",
  );
  const row = result.rows[0];
  return {
    count: Number(row?.n ?? 0),
    bytes: Number(row?.bytes ?? 0),
  };
}
