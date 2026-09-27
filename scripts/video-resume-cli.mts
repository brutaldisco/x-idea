/**
 * ブラウザ外で failed / 途中の動画を tail 再開→結合→DB ready にする（ADR-028）。
 *
 *   VIDEO_LOCAL_ROOT=/path/to/x-idea_video/002 pnpm video:resume -- --id <downloadId>
 *   pnpm video:resume -- --all-failed
 */
import { createReadStream } from "node:fs";
import { open, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { getClient } from "@/db/client";
import { VIDEO_CDN_FETCH_INIT } from "@/lib/video-direct-fetch";
import { isFinishedVideoDownload } from "@/lib/video-files";
import { isSafeVideoRelPath, videoRelPath } from "@/lib/video-path";
import {
  hasMp4FtypAtStart,
  reconcileLocalVideoState,
} from "@/lib/video-resume-reconcile";
import { resolveVideoDownloadUrl } from "@/server/media/resolve-download-url";

const CHUNK = 16 * 1024 * 1024;

function usage(): never {
  console.error(
    "Usage: pnpm video:resume -- --id <downloadId> | --all-failed [--dry-run]",
  );
  process.exit(1);
}

function videoRoot(): string {
  const root = process.env.VIDEO_LOCAL_ROOT?.trim();
  if (!root) {
    console.error(
      "VIDEO_LOCAL_ROOT が未設定です（例: ~/Movies/x-idea_video/002）",
    );
    process.exit(1);
  }
  return root.replace(/^~/, process.env.HOME ?? "");
}

type Row = {
  id: string;
  media_id: string;
  status: string;
  progress_bytes: number | null;
  progress_total: number | null;
  rel_path: string | null;
  account_id: string;
  tweet_id: string;
  media_key: string;
};

async function loadRow(id: string): Promise<Row | null> {
  const res = await getClient().execute({
    sql: `SELECT d.id, d.media_id, d.status, d.progress_bytes, d.progress_total,
                 d.rel_path, d.x_account_id AS account_id,
                 p.tweet_id, m.media_key
          FROM video_downloads d
          JOIN media_assets m ON m.id = d.media_id
          JOIN x_posts p ON p.id = m.x_post_id
          WHERE d.id = ? LIMIT 1`,
    args: [id],
  });
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: String(row.id),
    media_id: String(row.media_id),
    status: String(row.status),
    progress_bytes:
      row.progress_bytes == null ? null : Number(row.progress_bytes),
    progress_total:
      row.progress_total == null ? null : Number(row.progress_total),
    rel_path: row.rel_path == null ? null : String(row.rel_path),
    account_id: String(row.account_id),
    tweet_id: String(row.tweet_id),
    media_key: String(row.media_key),
  };
}

async function listFailed(): Promise<Row[]> {
  const res = await getClient().execute({
    sql: `SELECT d.id, d.media_id, d.status, d.progress_bytes, d.progress_total,
                 d.rel_path, d.x_account_id AS account_id,
                 p.tweet_id, m.media_key
          FROM video_downloads d
          JOIN media_assets m ON m.id = d.media_id
          JOIN x_posts p ON p.id = m.x_post_id
          WHERE d.status = 'failed'
            AND COALESCE(d.progress_bytes, 0) > 0
          ORDER BY d.last_progress_at DESC`,
  });
  return res.rows.map((row) => ({
    id: String(row.id),
    media_id: String(row.media_id),
    status: String(row.status),
    progress_bytes:
      row.progress_bytes == null ? null : Number(row.progress_bytes),
    progress_total:
      row.progress_total == null ? null : Number(row.progress_total),
    rel_path: row.rel_path == null ? null : String(row.rel_path),
    account_id: String(row.account_id),
    tweet_id: String(row.tweet_id),
    media_key: String(row.media_key),
  }));
}

function relPathFor(row: Row): string {
  if (row.rel_path && isSafeVideoRelPath(row.rel_path)) {
    return row.rel_path;
  }
  return videoRelPath({
    accountId: row.account_id,
    tweetId: row.tweet_id,
    mediaKey: row.media_key,
  });
}

async function fetchRange(
  url: string,
  start: number,
  end: number,
): Promise<Response> {
  return fetch(url, {
    ...VIDEO_CDN_FETCH_INIT,
    headers: { Range: `bytes=${start}-${end}` },
  });
}

async function copyPartOntoMain(
  mainPath: string,
  partPath: string,
  mainOffset: number,
): Promise<void> {
  const mainHandle = await open(mainPath, "r+");
  try {
    let filePos = mainOffset;
    for await (const chunk of createReadStream(partPath)) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      await mainHandle.write(buf, 0, buf.length, filePos);
      filePos += buf.length;
    }
  } finally {
    await mainHandle.close();
  }
}

async function resumeRow(row: Row, dryRun: boolean): Promise<boolean> {
  const root = videoRoot();
  const rel = relPathFor(row);
  if (!isSafeVideoRelPath(rel)) {
    console.error(`skip ${row.id}: rel_path 不正`);
    return false;
  }
  const mainPath = path.join(root, rel);
  const partPath = `${mainPath}.part`;

  let mainSize = 0;
  let partSize = 0;
  try {
    mainSize = (await stat(mainPath)).size;
  } catch {
    console.error(`skip ${row.id}: 本体なし ${mainPath}`);
    return false;
  }
  try {
    partSize = (await stat(partPath)).size;
  } catch {
    partSize = 0;
  }

  const head = Buffer.alloc(8);
  const fh = await open(mainPath, "r");
  await fh.read(head, 0, 8, 0);
  await fh.close();
  const mainHasFtyp = hasMp4FtypAtStart(new Uint8Array(head));

  const softTotal = row.progress_total ?? 0;
  const state = reconcileLocalVideoState({
    mainSize,
    partSize,
    savedProgress: row.progress_bytes ?? 0,
    trustedTotal: null,
    softTotal: softTotal > 0 ? softTotal : null,
    mainHasFtyp,
  });

  console.log(
    `${row.id} phase=${state.phase} main=${mainSize} part=${partSize} total=${state.total}`,
  );

  if (state.phase === "fresh") {
    console.error(`skip ${row.id}: 再開対象なし（最初からになります）`);
    return false;
  }

  if (dryRun) {
    return true;
  }

  if (state.phase === "complete-only") {
    await markReady(row.id, rel, state.received);
    return true;
  }

  const total = state.total;
  if (!(total > 0)) {
    console.error(`skip ${row.id}: 総サイズ不明`);
    return false;
  }

  const mainOffset = state.mainOffset;
  const tailTotal = total - mainOffset;

  if (state.phase === "fetch-tail" || state.phase === "merge-only") {
    let tailOffset = state.tailOffset;
    if (state.phase === "fetch-tail" && tailOffset < tailTotal) {
      const resolved = await resolveVideoDownloadUrl(row.media_id);
      if (!resolved.ok) {
        console.error(`skip ${row.id}: ${resolved.error.message}`);
        return false;
      }
      const url = resolved.url;
      while (tailOffset < tailTotal) {
        const cdnStart = mainOffset + tailOffset;
        const cdnEnd = Math.min(cdnStart + CHUNK - 1, total - 1);
        const res = await fetchRange(url, cdnStart, cdnEnd);
        if (res.status === 416) {
          break;
        }
        if (!(res.status === 206 || res.status === 200)) {
          console.error(`skip ${row.id}: Range ${res.status}`);
          return false;
        }
        const body = Buffer.from(await res.arrayBuffer());
        if (body.length === 0) {
          return false;
        }
        const partFh = await open(partPath, "a");
        try {
          await partFh.write(body);
        } finally {
          await partFh.close();
        }
        tailOffset += body.length;
        console.log(`  tail ${tailOffset}/${tailTotal}`);
      }
      partSize = (await stat(partPath)).size;
      if (partSize < tailTotal) {
        console.error(`skip ${row.id}: tail 未完了`);
        return false;
      }
    }

    if (partSize > 0) {
      console.log("  merging…");
      await copyPartOntoMain(mainPath, partPath, mainOffset);
      await unlink(partPath).catch(() => undefined);
    }
  }

  const finalSize = (await stat(mainPath)).size;
  if (!isFinishedVideoDownload(finalSize, total)) {
    console.error(`skip ${row.id}: サイズ不足 ${finalSize}/${total}`);
    return false;
  }
  await markReady(row.id, rel, finalSize);
  console.log(`  ready ${finalSize}`);
  return true;
}

async function markReady(
  id: string,
  relPath: string,
  bytes: number,
): Promise<void> {
  await getClient().execute({
    sql: `UPDATE video_downloads SET
            status = 'ready', rel_path = ?, bytes = ?, error = NULL,
            downloaded_at = datetime('now'),
            last_progress_at = datetime('now'),
            progress_bytes = ?, progress_total = ?
          WHERE id = ?`,
    args: [relPath, bytes, bytes, bytes, id],
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const idIdx = args.indexOf("--id");
  const allFailed = args.includes("--all-failed");

  if (idIdx >= 0) {
    const id = args[idIdx + 1];
    if (!id) {
      usage();
    }
    const row = await loadRow(id);
    if (!row) {
      console.error("not found");
      process.exit(1);
    }
    const ok = await resumeRow(row, dryRun);
    process.exit(ok ? 0 : 1);
  }

  if (allFailed) {
    const rows = await listFailed();
    if (rows.length === 0) {
      console.log("failed で進捗ありの行はありません");
      return;
    }
    let ok = 0;
    for (const row of rows) {
      if (await resumeRow(row, dryRun)) {
        ok += 1;
      }
    }
    console.log(`done ${ok}/${rows.length}`);
    return;
  }

  usage();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
