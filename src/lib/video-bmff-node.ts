import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { type FileHandle, open, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import {
  isIsoBmffVideoName,
  type RandomAccessFile,
  readVideoFileMetadata,
  scanTopLevelBoxes,
  unchangedMediaRanges,
  writeVideoFileMetadata,
} from "@/lib/video-bmff-meta";
import {
  isThumbSidecarFileName,
  parseThumbSidecar,
  THUMB_SIDECAR_SUFFIX,
} from "@/lib/video-thumb-sidecar";

/** 読み取り結果はコピーなので、その後の writeAt では変わらない。 */
export class NodeRandomAccessFile implements RandomAccessFile {
  private handle: FileHandle | null = null;
  private knownSize: number | null = null;

  constructor(private readonly filePath: string) {}

  async close(): Promise<void> {
    await this.handle?.close();
    this.handle = null;
  }

  async size(): Promise<number> {
    if (this.knownSize == null) {
      this.knownSize = (await (await this.opened()).stat()).size;
    }
    return this.knownSize;
  }

  async readAt(offset: number, length: number): Promise<Uint8Array> {
    const handle = await this.opened();
    const buf = Buffer.alloc(length);
    let got = 0;
    while (got < length) {
      const { bytesRead } = await handle.read(
        buf,
        got,
        length - got,
        offset + got,
      );
      if (bytesRead === 0) {
        break;
      }
      got += bytesRead;
    }
    const copy = new Uint8Array(got);
    copy.set(buf.subarray(0, got));
    return copy;
  }

  async writeAt(offset: number, data: Uint8Array): Promise<void> {
    const handle = await this.opened();
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    let written = 0;
    while (written < buf.length) {
      const { bytesWritten } = await handle.write(
        buf,
        written,
        buf.length - written,
        offset + written,
      );
      if (bytesWritten === 0) {
        throw new Error("short write");
      }
      written += bytesWritten;
    }
    await handle.datasync();
    this.knownSize = (await handle.stat()).size;
  }

  async truncate(size: number): Promise<void> {
    const handle = await this.opened();
    await handle.truncate(size);
    await handle.datasync();
    this.knownSize = size;
  }

  private async opened(): Promise<FileHandle> {
    if (!this.handle) {
      this.handle = await open(this.filePath, "r+");
    }
    return this.handle;
  }
}

export type ThumbSidecarMigration =
  | {
      action: "embedded";
      videoPath: string;
      seconds: number;
      mode: "append" | "overwrite";
    }
  | {
      action: "skipped";
      videoPath: string;
      reason: "no-sidecar" | "unsupported" | "invalid-sidecar";
    }
  | { action: "kept-sidecar"; videoPath: string; reason: string };

/**
 * 従来の `{動画}.lvl.json` を一度だけ容器へ移す。
 * 対応付けにファイル名を使うのはこの移行だけ。移した値自体はパスを含まない。
 * 読み戻しと、メタデータ以外のバイト列の一致を確認してから JSON を消す。
 */
export async function migrateThumbSidecarFile(
  videoPath: string,
  log?: (message: string) => void,
): Promise<ThumbSidecarMigration> {
  const sidecarPath = `${videoPath}${THUMB_SIDECAR_SUFFIX}`;
  let raw: string;
  try {
    raw = await readText(sidecarPath);
  } catch (error) {
    if (isEnoent(error)) {
      return { action: "skipped", videoPath, reason: "no-sidecar" };
    }
    throw error;
  }
  if (!isIsoBmffVideoName(path.basename(videoPath))) {
    return { action: "skipped", videoPath, reason: "unsupported" };
  }
  const seconds = parseThumbSidecar(raw);
  if (seconds == null) {
    return { action: "skipped", videoPath, reason: "invalid-sidecar" };
  }
  let videoBytes = 0;
  try {
    videoBytes = (await stat(videoPath)).size;
  } catch (error) {
    if (isEnoent(error)) {
      return { action: "kept-sidecar", videoPath, reason: "missing-video" };
    }
    throw error;
  }
  try {
    await stat(`${videoPath}.part`);
    return {
      action: "kept-sidecar",
      videoPath,
      reason: "download-in-progress",
    };
  } catch (error) {
    if (!isEnoent(error)) {
      throw error;
    }
  }
  log?.(`hash ${videoBytes} ${videoPath}`);

  const probed = new NodeRandomAccessFile(videoPath);
  let ranges: Array<[number, number]>;
  try {
    const scan = await scanTopLevelBoxes(probed);
    if (!scan.ok) {
      return { action: "kept-sidecar", videoPath, reason: scan.reason };
    }
    ranges = unchangedMediaRanges(scan);
  } finally {
    await probed.close();
  }

  const beforeHash = await hashRanges(videoPath, ranges);
  const access = new NodeRandomAccessFile(videoPath);
  let mode: "append" | "overwrite" | undefined;
  try {
    const result = await writeVideoFileMetadata(access, seconds);
    if (!result.ok) {
      return { action: "kept-sidecar", videoPath, reason: result.reason };
    }
    const back = await readVideoFileMetadata(access);
    if (back !== seconds) {
      if (result.mode === "append") {
        await access.truncate(result.offset);
      }
      return { action: "kept-sidecar", videoPath, reason: "value-mismatch" };
    }
    mode = result.mode;
  } finally {
    await access.close();
  }
  if (mode == null) {
    return { action: "kept-sidecar", videoPath, reason: "value-mismatch" };
  }

  const afterHash = await hashRanges(videoPath, ranges);
  if (afterHash !== beforeHash) {
    if (mode === "append") {
      const rollback = new NodeRandomAccessFile(videoPath);
      try {
        await rollback.truncate(ranges[0]?.[1] ?? 0);
      } finally {
        await rollback.close();
      }
    }
    throw new Error(`media bytes changed: ${videoPath}`);
  }
  await unlink(sidecarPath);
  const embedded = await readBack(videoPath);
  if (embedded !== seconds) {
    throw new Error(`metadata readback mismatch: ${videoPath}`);
  }
  return { action: "embedded", videoPath, seconds, mode };
}

export async function migrateThumbSidecarsInDir(
  root: string,
  log?: (message: string) => void,
): Promise<ThumbSidecarMigration[]> {
  const results: ThumbSidecarMigration[] = [];
  await walk(root, results, log);
  return results;
}

async function walk(
  dir: string,
  results: ThumbSidecarMigration[],
  log?: (message: string) => void,
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, results, log);
      continue;
    }
    if (!entry.isFile() || !isThumbSidecarFileName(entry.name)) {
      continue;
    }
    const videoPath = full.slice(0, -THUMB_SIDECAR_SUFFIX.length);
    results.push(await migrateThumbSidecarFile(videoPath, log));
  }
}

async function readBack(videoPath: string): Promise<number | null> {
  const access = new NodeRandomAccessFile(videoPath);
  try {
    return await readVideoFileMetadata(access);
  } finally {
    await access.close();
  }
}

function hashRanges(
  filePath: string,
  ranges: Array<[number, number]>,
): Promise<string> {
  const hash = createHash("sha256");
  return ranges
    .reduce(
      (chain, [start, endExclusive]) =>
        chain.then(
          () =>
            new Promise<void>((resolve, reject) => {
              if (endExclusive <= start) {
                resolve();
                return;
              }
              const stream = createReadStream(filePath, {
                start,
                end: endExclusive - 1,
              });
              stream.on("data", (chunk) => {
                hash.update(chunk);
              });
              stream.on("error", reject);
              stream.on("end", () => resolve());
            }),
        ),
      Promise.resolve(),
    )
    .then(() => hash.digest("hex"));
}

function readText(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = createReadStream(filePath, { encoding: "utf8" });
    stream.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
