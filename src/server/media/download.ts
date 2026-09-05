import { unlink, writeFile } from "node:fs/promises";
import { getClient } from "@/db/client";
import { logger } from "@/lib/logger";
import { withRetry } from "@/lib/retry";
import { enqueueJob } from "@/server/jobs/queue";
import {
  hasMediaBlob,
  MAX_BLOB_BYTES,
  saveMediaBlob,
} from "@/server/media/blob";
import { fetchRemoteMedia } from "@/server/media/fetch-remote";
import {
  ensureMediaDir,
  isLocalMediaEnabled,
  relativeMediaPath,
} from "@/server/media/paths";
import { refreshMediaFromTweet } from "@/server/media/refresh";
import {
  downloadUrlFor,
  parseVariantsJson,
  previewUrlFor,
} from "@/server/media/select";
import { encodePhotoWebp } from "@/server/media/webp";

export type MediaRow = {
  id: string;
  x_post_id: string;
  media_key: string;
  type: string;
  preview_url: string | null;
  media_url: string | null;
  duration_ms: number | null;
  variants_json: string | null;
  download_status: string;
  tweet_id: string;
};

export async function loadMediaRow(mediaId: string): Promise<MediaRow | null> {
  const result = await getClient().execute({
    sql: `SELECT m.id, m.x_post_id, m.media_key, m.type, m.preview_url, m.media_url,
                 m.duration_ms, m.variants_json, m.download_status, p.tweet_id
          FROM media_assets m
          JOIN x_posts p ON p.id = m.x_post_id
          WHERE m.id = ?
          LIMIT 1`,
    args: [mediaId],
  });
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: String(row.id),
    x_post_id: String(row.x_post_id),
    media_key: String(row.media_key),
    type: String(row.type),
    preview_url: row.preview_url ? String(row.preview_url) : null,
    media_url: row.media_url ? String(row.media_url) : null,
    duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
    variants_json: row.variants_json ? String(row.variants_json) : null,
    download_status: String(row.download_status),
    tweet_id: String(row.tweet_id),
  };
}

async function setStatus(
  id: string,
  status: string,
  extra?: { error?: string | null; path?: string; bytes?: number },
): Promise<void> {
  await getClient().execute({
    sql: `UPDATE media_assets SET
      download_status = ?,
      download_error = ?,
      local_path = COALESCE(?, local_path),
      local_bytes = COALESCE(?, local_bytes),
      downloaded_at = CASE WHEN ? = 'ready' THEN datetime('now') ELSE downloaded_at END
      WHERE id = ?`,
    args: [
      status,
      extra?.error ?? null,
      extra?.path ?? null,
      extra?.bytes ?? null,
      status,
      id,
    ],
  });
}

async function fetchToWebp(url: string): Promise<Buffer> {
  const res = await withRetry(
    async () => {
      const response = await fetchRemoteMedia(url);
      if (response.status === 429 || response.status >= 500) {
        const error = new Error(`media fetch ${response.status}`);
        (error as { status?: number }).status = response.status;
        throw error;
      }
      if (!response.ok) {
        throw new Error(`media fetch failed (${response.status})`);
      }
      return response;
    },
    { attempts: 3 },
  );
  const buf = Buffer.from(await res.arrayBuffer());
  return encodePhotoWebp(buf);
}

export async function downloadMediaAsset(input: {
  mediaId: string;
  accountId: string;
  force?: boolean;
}): Promise<void> {
  const row = await loadMediaRow(input.mediaId);
  if (!row) {
    throw new Error("media not found");
  }
  if (!input.force && (await hasMediaBlob(row.id))) {
    if (row.download_status !== "ready") {
      await setStatus(row.id, "ready");
    }
    return;
  }
  if (row.download_status === "ready" && !input.force) {
    return;
  }
  if (row.download_status === "awaiting_confirm" && !input.force) {
    return;
  }
  if (row.download_status === "skipped" && !input.force) {
    return;
  }
  if (row.download_status === "downloading" && !input.force) {
    return;
  }

  await refreshMediaFromTweet({
    mediaId: input.mediaId,
    accountId: input.accountId,
  });
  const fresh = await loadMediaRow(input.mediaId);
  if (!fresh) {
    throw new Error("media not found");
  }

  const isVideo = fresh.type !== "photo";
  const url = isVideo
    ? previewUrlFor({
        type: fresh.type,
        media_url: fresh.media_url,
        preview_url: fresh.preview_url,
      })
    : downloadUrlFor({
        type: fresh.type,
        media_url: fresh.media_url,
        variants: parseVariantsJson(fresh.variants_json),
      });
  if (!url) {
    await setStatus(fresh.id, "failed", {
      error:
        fresh.type === "photo"
          ? "no downloadable url (photo url missing)"
          : "no preview image for video",
    });
    return;
  }

  try {
    await setStatus(fresh.id, "downloading");
    const webp = await fetchToWebp(url);
    if (webp.length > MAX_BLOB_BYTES) {
      await setStatus(fresh.id, "failed", {
        error: "converted image too large",
      });
      return;
    }
    const bytes = await saveMediaBlob({
      mediaId: fresh.id,
      data: new Uint8Array(webp),
    });

    let path: string | undefined;
    if (isLocalMediaEnabled()) {
      const relative = relativeMediaPath({
        accountId: input.accountId,
        tweetId: fresh.tweet_id,
        mediaKey: fresh.media_key,
        ext: ".webp",
      });
      try {
        const abs = await ensureMediaDir(relative);
        await writeFile(abs, webp);
        path = relative;
      } catch (error) {
        logger.warn(
          { err: error, mediaId: fresh.id },
          "local webp write skipped after blob save",
        );
      }
    }

    await setStatus(fresh.id, "ready", { path, bytes });
    logger.info({ mediaId: fresh.id, bytes }, "media_blob ready");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isLocalMediaEnabled()) {
      try {
        const relative = relativeMediaPath({
          accountId: input.accountId,
          tweetId: fresh.tweet_id,
          mediaKey: fresh.media_key,
          ext: ".webp",
        });
        const abs = await ensureMediaDir(relative);
        await unlink(abs);
      } catch {
        // ignore cleanup
      }
    }
    await setStatus(fresh.id, "failed", { error: message.slice(0, 400) });
    throw error;
  }
}

export async function markMediaSkipped(mediaId: string): Promise<void> {
  await setStatus(mediaId, "skipped");
}

export async function confirmMediaDownload(input: {
  mediaId: string;
  accountId: string;
}): Promise<void> {
  await setStatus(input.mediaId, "pending");
  await enqueueJob({
    type: "media_download",
    payload: {
      media_id: input.mediaId,
      account_id: input.accountId,
      force: true,
    },
    dedupeKey: `media_download:${input.mediaId}`,
    timeoutSec: 1800,
  });
}
