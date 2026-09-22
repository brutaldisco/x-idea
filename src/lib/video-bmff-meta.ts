/**
 * MP4 / MOV / M4V（ISO BMFF）の末尾に、サムネ秒数を固定長の uuid ボックスで置く。
 * トップレベルはヘッダーだけを読み、映像・音声のバイトは書き換えない。
 * ファイル名・相対パス・フォルダ名はキーにしない。値はファイルの中だけにある。
 */

/** 3f6a0c1e-8b24-4d7a-9f50-6c1e8a4b2d90 */
export const VIDEO_META_USER_TYPE = Uint8Array.of(
  0x3f,
  0x6a,
  0x0c,
  0x1e,
  0x8b,
  0x24,
  0x4d,
  0x7a,
  0x9f,
  0x50,
  0x6c,
  0x1e,
  0x8a,
  0x4b,
  0x2d,
  0x90,
);

/** 走査で 1 回に読むヘッダーの上限（size / largesize / uuid ユーザー型） */
export const VIDEO_META_HEADER_PROBE = 16;
const UUID_HEADER = 8 + VIDEO_META_USER_TYPE.byteLength;
const PAYLOAD_SIZE = 256;
export const VIDEO_META_BOX_SIZE = UUID_HEADER + PAYLOAD_SIZE;

const FLAG_THUMB_SEEK = 0x01;
const PAYLOAD_VERSION = 1;

export interface RandomAccessFile {
  size(): Promise<number>;
  /** 後からファイルを書き換えても、返した配列は変わらないこと。 */
  readAt(offset: number, length: number): Promise<Uint8Array>;
  writeAt(offset: number, data: Uint8Array): Promise<void>;
  truncate(size: number): Promise<void>;
}

export type VideoMetaRefusal =
  | "size-zero"
  | "truncated"
  | "size-mismatch"
  | "invalid-size"
  | "readback";

export type TopLevelScan =
  | { ok: true; fileSize: number; metaOffset: number | null }
  | { ok: false; reason: Exclude<VideoMetaRefusal, "readback"> };

export type VideoMetaWriteResult =
  | { ok: true; mode: "append" | "overwrite"; offset: number }
  | { ok: false; reason: VideoMetaRefusal };

const BMFF_EXTENSIONS = new Set([".mp4", ".mov", ".m4v"]);

export function isIsoBmffVideoName(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) {
    return false;
  }
  return BMFF_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

export function encodeVideoMetaBox(seconds: number): Uint8Array {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error("Invalid thumbnail seek position");
  }
  const box = new Uint8Array(VIDEO_META_BOX_SIZE);
  const view = new DataView(box.buffer);
  view.setUint32(0, VIDEO_META_BOX_SIZE, false);
  box.set([0x75, 0x75, 0x69, 0x64], 4);
  box.set(VIDEO_META_USER_TYPE, 8);
  box[UUID_HEADER] = PAYLOAD_VERSION;
  box[UUID_HEADER + 1] = FLAG_THUMB_SEEK;
  view.setFloat64(UUID_HEADER + 8, seconds, false);
  return box;
}

export function decodeVideoMetaBox(box: Uint8Array): number | null {
  if (box.byteLength !== VIDEO_META_BOX_SIZE) {
    return null;
  }
  const view = new DataView(box.buffer, box.byteOffset, box.byteLength);
  if (view.getUint32(0, false) !== VIDEO_META_BOX_SIZE) {
    return null;
  }
  if (
    box[4] !== 0x75 ||
    box[5] !== 0x75 ||
    box[6] !== 0x69 ||
    box[7] !== 0x64
  ) {
    return null;
  }
  for (let i = 0; i < VIDEO_META_USER_TYPE.byteLength; i++) {
    if (box[8 + i] !== VIDEO_META_USER_TYPE[i]) {
      return null;
    }
  }
  if (box[UUID_HEADER] !== PAYLOAD_VERSION) {
    return null;
  }
  if ((box[UUID_HEADER + 1] & FLAG_THUMB_SEEK) === 0) {
    return null;
  }
  const seconds = view.getFloat64(UUID_HEADER + 8, false);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return seconds;
}

export async function scanTopLevelBoxes(
  file: RandomAccessFile,
): Promise<TopLevelScan> {
  const fileSize = await file.size();
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) {
    return { ok: false, reason: "invalid-size" };
  }
  if (fileSize === 0) {
    return { ok: false, reason: "invalid-size" };
  }
  let offset = 0;
  let metaOffset: number | null = null;
  while (offset < fileSize) {
    const head = await readExact(file, offset, 8);
    if (!head) {
      return { ok: false, reason: "truncated" };
    }
    const size32 = readU32(head, 0);
    const type = fourcc(head, 4);
    if (size32 === 0) {
      return { ok: false, reason: "size-zero" };
    }
    let headerSize = 8;
    let boxSize = size32;
    if (size32 === 1) {
      const extended = await readExact(file, offset + 8, 8);
      if (!extended) {
        return { ok: false, reason: "truncated" };
      }
      const large = readU64(extended, 0);
      if (large == null) {
        return { ok: false, reason: "invalid-size" };
      }
      headerSize = 16;
      boxSize = large;
    }
    if (!Number.isSafeInteger(boxSize) || boxSize < headerSize) {
      return { ok: false, reason: "invalid-size" };
    }
    if (type === "uuid") {
      if (boxSize < headerSize + VIDEO_META_USER_TYPE.byteLength) {
        return { ok: false, reason: "invalid-size" };
      }
      const userType = await readExact(
        file,
        offset + headerSize,
        VIDEO_META_USER_TYPE.byteLength,
      );
      if (!userType) {
        return { ok: false, reason: "truncated" };
      }
      if (sameBytes(userType, VIDEO_META_USER_TYPE)) {
        if (boxSize !== VIDEO_META_BOX_SIZE || metaOffset != null) {
          return { ok: false, reason: "invalid-size" };
        }
        metaOffset = offset;
      }
    }
    if (boxSize > fileSize - offset) {
      return { ok: false, reason: "size-mismatch" };
    }
    offset += boxSize;
  }
  if (offset !== fileSize) {
    return { ok: false, reason: "size-mismatch" };
  }
  return { ok: true, fileSize, metaOffset };
}

export async function readVideoFileMetadata(
  file: RandomAccessFile,
): Promise<number | null> {
  const scan = await scanTopLevelBoxes(file);
  if (!scan.ok || scan.metaOffset == null) {
    return null;
  }
  const box = await readExact(file, scan.metaOffset, VIDEO_META_BOX_SIZE);
  if (!box) {
    return null;
  }
  return decodeVideoMetaBox(box);
}

export async function writeVideoFileMetadata(
  file: RandomAccessFile,
  seconds: number,
): Promise<VideoMetaWriteResult> {
  const box = encodeVideoMetaBox(seconds);
  const scan = await scanTopLevelBoxes(file);
  if (!scan.ok) {
    return scan;
  }
  if (scan.metaOffset == null) {
    return appendMetaBox(file, scan.fileSize, box);
  }
  return overwriteMetaBox(file, scan.fileSize, scan.metaOffset, box);
}

/**
 * 対応形式は容器へ書き、読み戻しが成功したあとでだけサイドカーを消す。
 * 対応外の形式は従来のサイドカーのまま。
 */
export async function saveVideoThumbSeek(input: {
  fileName: string;
  seconds: number;
  openVideo: () => Promise<RandomAccessFile>;
  writeSidecar: (seconds: number) => Promise<void>;
  deleteSidecar: () => Promise<void>;
}): Promise<"embedded" | "sidecar"> {
  if (!isIsoBmffVideoName(input.fileName)) {
    await input.writeSidecar(input.seconds);
    return "sidecar";
  }
  const result = await writeVideoFileMetadata(
    await input.openVideo(),
    input.seconds,
  );
  if (!result.ok) {
    throw new Error(`動画にサムネ位置を書けませんでした (${result.reason})`);
  }
  await input.deleteSidecar();
  return "embedded";
}

export async function loadVideoThumbSeek(input: {
  fileName: string;
  openVideo: () => Promise<RandomAccessFile>;
  readSidecar: () => Promise<number | null>;
}): Promise<number | null> {
  if (isIsoBmffVideoName(input.fileName)) {
    try {
      const seconds = await readVideoFileMetadata(await input.openVideo());
      if (seconds != null) {
        return seconds;
      }
    } catch {
      // 容器が読めないときは従来の JSON を見る
    }
  }
  try {
    return await input.readSidecar();
  } catch {
    return null;
  }
}

/** 上書きしない範囲。再保存時は uuid ボックス自身を除く。 */
export function unchangedMediaRanges(scan: {
  fileSize: number;
  metaOffset: number | null;
}): Array<[number, number]> {
  if (scan.metaOffset == null) {
    return [[0, scan.fileSize]];
  }
  return [
    [0, scan.metaOffset],
    [scan.metaOffset + VIDEO_META_BOX_SIZE, scan.fileSize],
  ];
}

async function appendMetaBox(
  file: RandomAccessFile,
  originalSize: number,
  box: Uint8Array,
): Promise<VideoMetaWriteResult> {
  try {
    await file.writeAt(originalSize, box);
  } catch (error) {
    await restoreSize(file, originalSize);
    throw error;
  }
  const size = await file.size();
  const back = await readExact(file, originalSize, box.byteLength);
  if (
    size !== originalSize + box.byteLength ||
    !back ||
    !sameBytes(back, box)
  ) {
    await restoreSize(file, originalSize);
    return { ok: false, reason: "readback" };
  }
  return { ok: true, mode: "append", offset: originalSize };
}

async function overwriteMetaBox(
  file: RandomAccessFile,
  originalSize: number,
  offset: number,
  box: Uint8Array,
): Promise<VideoMetaWriteResult> {
  const previous = await readExact(file, offset, box.byteLength);
  if (!previous) {
    return { ok: false, reason: "truncated" };
  }
  try {
    await file.writeAt(offset, box);
  } catch (error) {
    await file.writeAt(offset, previous).catch(() => {});
    if ((await file.size()) !== originalSize) {
      await restoreSize(file, originalSize);
    }
    throw error;
  }
  const size = await file.size();
  const back = await readExact(file, offset, box.byteLength);
  if (size !== originalSize || !back || !sameBytes(back, box)) {
    await file.writeAt(offset, previous);
    if ((await file.size()) !== originalSize) {
      await restoreSize(file, originalSize);
    }
    const restored = await readExact(file, offset, previous.byteLength);
    if (!restored || !sameBytes(restored, previous)) {
      throw new Error("metadata rollback failed");
    }
    return { ok: false, reason: "readback" };
  }
  return { ok: true, mode: "overwrite", offset };
}

async function restoreSize(
  file: RandomAccessFile,
  originalSize: number,
): Promise<void> {
  if ((await file.size()) === originalSize) {
    return;
  }
  await file.truncate(originalSize);
  if ((await file.size()) !== originalSize) {
    throw new Error("metadata rollback failed");
  }
}

async function readExact(
  file: RandomAccessFile,
  offset: number,
  length: number,
): Promise<Uint8Array | null> {
  if (length > VIDEO_META_BOX_SIZE) {
    throw new Error("refusing to read past a fixed metadata box");
  }
  const bytes = await file.readAt(offset, length);
  if (bytes.byteLength !== length) {
    return null;
  }
  return bytes;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(offset, false);
}

function readU64(bytes: Uint8Array, offset: number): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hi = view.getUint32(offset, false);
  const lo = view.getUint32(offset + 4, false);
  const value = hi * 2 ** 32 + lo;
  if (!Number.isSafeInteger(value)) {
    return null;
  }
  return value;
}

function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
