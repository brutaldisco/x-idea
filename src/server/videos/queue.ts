import { getClient } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import {
  isSafeVideoRelPath,
  sanitizeFolderName,
  VIDEO_QUEUE_MAX,
  videoRelPath,
} from "@/lib/video-path";
import { accountIdForMedia } from "@/server/media/account";
import { loadMediaRow } from "@/server/media/download";
import { refreshMediaFromTweet } from "@/server/media/refresh";
import { parseVariantsJson, pickBestMp4Url } from "@/server/media/select";
import { type AccountContext, contextAccountId } from "@/server/x/context";

export type VideoFolder = {
  id: string;
  name: string;
  accountId: string;
};

export type VideoItem = {
  id: string;
  mediaId: string;
  accountId: string;
  folderId: string | null;
  folderName: string | null;
  status: string;
  relPath: string | null;
  bytes: number | null;
  error: string | null;
  queuedAt: string;
  downloadedAt: string | null;
  tweetId: string;
  mediaKey: string;
  sourceId: string | null;
  postUrl: string | null;
  authorUsername: string | null;
  excerpt: string;
  durationMs: number | null;
  previewSrc: string;
};

export type VideoLibraryPayload = {
  queuedCount: number;
  queueMax: number;
  folders: VideoFolder[];
  queue: VideoItem[];
  library: VideoItem[];
};

function asItem(row: Record<string, unknown>): VideoItem {
  const text = row.text ? String(row.text) : "";
  return {
    id: String(row.id),
    mediaId: String(row.media_id),
    accountId: String(row.x_account_id),
    folderId: row.folder_id ? String(row.folder_id) : null,
    folderName: row.folder_name ? String(row.folder_name) : null,
    status: String(row.status),
    relPath: row.rel_path ? String(row.rel_path) : null,
    bytes: row.bytes == null ? null : Number(row.bytes),
    error: row.error ? String(row.error) : null,
    queuedAt: String(row.queued_at),
    downloadedAt: row.downloaded_at ? String(row.downloaded_at) : null,
    tweetId: String(row.tweet_id ?? ""),
    mediaKey: String(row.media_key ?? ""),
    sourceId: row.source_id ? String(row.source_id) : null,
    postUrl: row.post_url ? String(row.post_url) : null,
    authorUsername: row.author_username ? String(row.author_username) : null,
    excerpt: text.slice(0, 140),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    previewSrc: `/api/media/${row.media_id}?preview=1`,
  };
}

async function queuedCount(accountId: string): Promise<number> {
  const result = await getClient().execute({
    sql: `SELECT COUNT(*) AS n FROM video_downloads
          WHERE x_account_id = ? AND status = 'queued'`,
    args: [accountId],
  });
  return Number(result.rows[0]?.n ?? 0);
}

async function requireMp4Url(
  mediaId: string,
  accountId: string,
): Promise<void> {
  let row = await loadMediaRow(mediaId);
  if (!row) {
    throw new AppError("NOT_FOUND", "メディアがありません");
  }
  if (row.type === "photo") {
    throw new AppError("VALIDATION", "画像はキューに入れません", {
      status: 422,
    });
  }
  let variants = parseVariantsJson(row.variants_json);
  if (!pickBestMp4Url(variants)) {
    await refreshMediaFromTweet({ mediaId, accountId });
    row = await loadMediaRow(mediaId);
    variants = parseVariantsJson(row?.variants_json);
  }
  if (!pickBestMp4Url(variants)) {
    throw new AppError(
      "VALIDATION",
      "この動画は保存できません（mp4 がありません）",
      { status: 422 },
    );
  }
}

export async function listVideoLibrary(
  ctx: AccountContext,
): Promise<VideoLibraryPayload> {
  await ensureSchema();
  const accountId = contextAccountId(ctx);
  if (!accountId) {
    return {
      queuedCount: 0,
      queueMax: VIDEO_QUEUE_MAX,
      folders: [],
      queue: [],
      library: [],
    };
  }
  const client = getClient();
  const [folders, rows, queued] = await Promise.all([
    client.execute({
      sql: `SELECT id, name, x_account_id FROM video_folders
            WHERE x_account_id = ?
            ORDER BY name ASC LIMIT 80`,
      args: [accountId],
    }),
    client.execute({
      sql: `SELECT d.id, d.media_id, d.x_account_id, d.folder_id, d.status,
                   d.rel_path, d.bytes, d.error, d.queued_at, d.downloaded_at,
                   f.name AS folder_name, m.media_key, m.duration_ms,
                   p.tweet_id, p.text, p.author_username, p.url AS post_url,
                   s.id AS source_id
            FROM video_downloads d
            JOIN media_assets m ON m.id = d.media_id
            JOIN x_posts p ON p.id = m.x_post_id
            LEFT JOIN video_folders f ON f.id = d.folder_id
            LEFT JOIN sources s ON s.x_post_id = p.id
            WHERE d.x_account_id = ?
            ORDER BY d.queued_at DESC
            LIMIT 200`,
      args: [accountId],
    }),
    queuedCount(accountId),
  ]);
  const items = rows.rows.map((row) => asItem(row as Record<string, unknown>));
  return {
    queuedCount: queued,
    queueMax: VIDEO_QUEUE_MAX,
    folders: folders.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      accountId: String(row.x_account_id),
    })),
    queue: items.filter((item) =>
      ["queued", "downloading", "failed"].includes(item.status),
    ),
    library: items.filter((item) => item.status === "ready"),
  };
}

export async function enqueueVideo(
  mediaId: string,
  ctx: AccountContext,
): Promise<VideoItem> {
  const accountId = contextAccountId(ctx);
  if (!accountId) {
    throw new AppError("VALIDATION", "アカウントを選んでください");
  }
  const mediaAccount = await accountIdForMedia(mediaId);
  if (!mediaAccount) {
    throw new AppError("NOT_FOUND", "メディアがありません");
  }
  if (mediaAccount !== accountId) {
    throw new AppError("FORBIDDEN", "このアカウントの動画ではありません");
  }
  await requireMp4Url(mediaId, accountId);

  const existing = await getClient().execute({
    sql: `SELECT id, status FROM video_downloads WHERE media_id = ? LIMIT 1`,
    args: [mediaId],
  });
  const row = existing.rows[0];
  if (row) {
    const status = String(row.status);
    if (status === "ready") {
      throw new AppError("CONFLICT", "すでにライブラリにあります");
    }
    if (status === "queued" || status === "downloading") {
      throw new AppError("CONFLICT", "すでにキューにあります");
    }
    if (status === "failed" || status === "canceled") {
      const count = await queuedCount(accountId);
      if (count >= VIDEO_QUEUE_MAX) {
        throw new AppError(
          "CONFLICT",
          `キューがいっぱいです（${VIDEO_QUEUE_MAX}件）。実行してから追加してください`,
        );
      }
      await getClient().execute({
        sql: `UPDATE video_downloads SET
                status = 'queued', error = NULL, queued_at = datetime('now')
              WHERE id = ?`,
        args: [String(row.id)],
      });
      return loadVideoItem(String(row.id));
    }
  }

  const count = await queuedCount(accountId);
  if (count >= VIDEO_QUEUE_MAX) {
    throw new AppError(
      "CONFLICT",
      `キューがいっぱいです（${VIDEO_QUEUE_MAX}件）。実行してから追加してください`,
    );
  }

  const id = newId();
  await getClient().execute({
    sql: `INSERT INTO video_downloads (
            id, media_id, x_account_id, status, queued_at
          ) VALUES (?, ?, ?, 'queued', datetime('now'))`,
    args: [id, mediaId, accountId],
  });
  return loadVideoItem(id);
}

export async function loadVideoItem(id: string): Promise<VideoItem> {
  const result = await getClient().execute({
    sql: `SELECT d.id, d.media_id, d.x_account_id, d.folder_id, d.status,
                 d.rel_path, d.bytes, d.error, d.queued_at, d.downloaded_at,
                 f.name AS folder_name, m.media_key, m.duration_ms,
                 p.tweet_id, p.text, p.author_username, p.url AS post_url,
                 s.id AS source_id
          FROM video_downloads d
          JOIN media_assets m ON m.id = d.media_id
          JOIN x_posts p ON p.id = m.x_post_id
          LEFT JOIN video_folders f ON f.id = d.folder_id
          LEFT JOIN sources s ON s.x_post_id = p.id
          WHERE d.id = ?
          LIMIT 1`,
    args: [id],
  });
  const row = result.rows[0];
  if (!row) {
    throw new AppError("NOT_FOUND", "キュー項目がありません");
  }
  return asItem(row as Record<string, unknown>);
}

async function ownedItem(id: string, accountId: string): Promise<VideoItem> {
  const item = await loadVideoItem(id);
  if (item.accountId !== accountId) {
    throw new AppError("FORBIDDEN", "このアカウントの動画ではありません");
  }
  return item;
}

export async function updateVideoQueue(
  id: string,
  ctx: AccountContext,
  action: "cancel" | "retry" | "fail",
  error?: string,
): Promise<VideoItem> {
  const accountId = contextAccountId(ctx);
  if (!accountId) {
    throw new AppError("VALIDATION", "アカウントを選んでください");
  }
  const item = await ownedItem(id, accountId);
  if (action === "cancel") {
    if (item.status === "ready") {
      throw new AppError("CONFLICT", "保存済みの動画は取り消せません");
    }
    await getClient().execute({
      sql: "UPDATE video_downloads SET status = 'canceled' WHERE id = ?",
      args: [id],
    });
    return loadVideoItem(id);
  }
  if (action === "retry") {
    if (item.status !== "failed" && item.status !== "canceled") {
      throw new AppError("VALIDATION", "再試行できる状態ではありません");
    }
    const count = await queuedCount(accountId);
    if (count >= VIDEO_QUEUE_MAX) {
      throw new AppError(
        "CONFLICT",
        `キューがいっぱいです（${VIDEO_QUEUE_MAX}件）。実行してから追加してください`,
      );
    }
    await getClient().execute({
      sql: `UPDATE video_downloads SET
              status = 'queued', error = NULL, queued_at = datetime('now')
            WHERE id = ?`,
      args: [id],
    });
    return loadVideoItem(id);
  }
  await getClient().execute({
    sql: `UPDATE video_downloads SET status = 'failed', error = ?
          WHERE id = ?`,
    args: [error?.slice(0, 400) ?? "download failed", id],
  });
  return loadVideoItem(id);
}

export async function markVideoDownloading(
  id: string,
  ctx: AccountContext,
): Promise<void> {
  const accountId = contextAccountId(ctx);
  if (!accountId) {
    throw new AppError("VALIDATION", "アカウントを選んでください");
  }
  await ownedItem(id, accountId);
  await getClient().execute({
    sql: `UPDATE video_downloads SET status = 'downloading', error = NULL
          WHERE id = ? AND status IN ('queued', 'failed')`,
    args: [id],
  });
}

export async function completeVideoDownload(
  id: string,
  ctx: AccountContext,
  input: { relPath: string; bytes: number },
): Promise<VideoItem> {
  const accountId = contextAccountId(ctx);
  if (!accountId) {
    throw new AppError("VALIDATION", "アカウントを選んでください");
  }
  const item = await ownedItem(id, accountId);
  if (!isSafeVideoRelPath(input.relPath)) {
    throw new AppError("VALIDATION", "保存パスが不正です");
  }
  if (!input.relPath.startsWith(`${item.accountId}/`)) {
    throw new AppError("VALIDATION", "保存パスが不正です");
  }
  if (!Number.isFinite(input.bytes) || input.bytes < 0) {
    throw new AppError("VALIDATION", "サイズが不正です");
  }
  await getClient().execute({
    sql: `UPDATE video_downloads SET
            status = 'ready', rel_path = ?, bytes = ?, error = NULL,
            downloaded_at = datetime('now')
          WHERE id = ?`,
    args: [input.relPath, Math.round(input.bytes), id],
  });
  return loadVideoItem(id);
}

export async function moveVideo(
  id: string,
  ctx: AccountContext,
  folderId: string | null,
): Promise<VideoItem> {
  const accountId = contextAccountId(ctx);
  if (!accountId) {
    throw new AppError("VALIDATION", "アカウントを選んでください");
  }
  const item = await ownedItem(id, accountId);
  let folderName: string | null = null;
  if (folderId) {
    const folder = await getClient().execute({
      sql: `SELECT name FROM video_folders
            WHERE id = ? AND x_account_id = ? LIMIT 1`,
      args: [folderId, accountId],
    });
    if (!folder.rows[0]) {
      throw new AppError("NOT_FOUND", "フォルダがありません");
    }
    folderName = String(folder.rows[0].name);
  }
  const relPath = videoRelPath({
    accountId,
    folderName,
    tweetId: item.tweetId,
    mediaKey: item.mediaKey,
  });
  await getClient().execute({
    sql: `UPDATE video_downloads SET folder_id = ?, rel_path = ?
          WHERE id = ?`,
    args: [folderId, relPath, id],
  });
  return loadVideoItem(id);
}

export async function deleteVideo(
  id: string,
  ctx: AccountContext,
): Promise<{ relPath: string | null }> {
  const accountId = contextAccountId(ctx);
  if (!accountId) {
    throw new AppError("VALIDATION", "アカウントを選んでください");
  }
  const item = await ownedItem(id, accountId);
  await getClient().execute({
    sql: "DELETE FROM video_downloads WHERE id = ?",
    args: [id],
  });
  return { relPath: item.relPath };
}

export async function createVideoFolder(
  name: string,
  ctx: AccountContext,
): Promise<VideoFolder> {
  const accountId = contextAccountId(ctx);
  if (!accountId) {
    throw new AppError("VALIDATION", "アカウントを選んでください");
  }
  let safe = sanitizeFolderName(name);
  const existing = await getClient().execute({
    sql: `SELECT name FROM video_folders WHERE x_account_id = ? LIMIT 80`,
    args: [accountId],
  });
  const used = new Set(existing.rows.map((row) => String(row.name)));
  if (used.has(safe)) {
    let n = 2;
    while (used.has(`${safe} (${n})`)) {
      n += 1;
    }
    safe = `${safe} (${n})`;
  }
  const id = newId();
  await getClient().execute({
    sql: `INSERT INTO video_folders (id, x_account_id, name, created_at)
          VALUES (?, ?, ?, datetime('now'))`,
    args: [id, accountId, safe],
  });
  return { id, name: safe, accountId };
}

export async function deleteVideoFolder(
  folderId: string,
  ctx: AccountContext,
): Promise<void> {
  const accountId = contextAccountId(ctx);
  if (!accountId) {
    throw new AppError("VALIDATION", "アカウントを選んでください");
  }
  const folder = await getClient().execute({
    sql: `SELECT id FROM video_folders WHERE id = ? AND x_account_id = ? LIMIT 1`,
    args: [folderId, accountId],
  });
  if (!folder.rows[0]) {
    throw new AppError("NOT_FOUND", "フォルダがありません");
  }
  await getClient().execute({
    sql: `UPDATE video_downloads SET folder_id = NULL WHERE folder_id = ?`,
    args: [folderId],
  });
  await getClient().execute({
    sql: "DELETE FROM video_folders WHERE id = ?",
    args: [folderId],
  });
}

export async function getVideoLibraryUsage(): Promise<{
  count: number;
  bytes: number;
}> {
  await ensureSchema();
  const result = await getClient().execute(
    `SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes
     FROM video_downloads WHERE status = 'ready' LIMIT 1`,
  );
  const row = result.rows[0];
  return {
    count: Number(row?.n ?? 0),
    bytes: Number(row?.bytes ?? 0),
  };
}

export async function videoSaveStatusByMediaIds(
  mediaIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (mediaIds.length === 0) {
    return map;
  }
  const placeholders = mediaIds.map(() => "?").join(", ");
  const result = await getClient().execute({
    sql: `SELECT media_id, status FROM video_downloads
          WHERE media_id IN (${placeholders}) LIMIT 40`,
    args: mediaIds,
  });
  for (const row of result.rows) {
    map.set(String(row.media_id), String(row.status));
  }
  return map;
}
