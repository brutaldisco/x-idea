import {
  initialVideoDownloadPlan,
  tuneVideoDownloadPlan,
  VIDEO_CHUNK_MAX,
  VIDEO_CHUNK_MIN,
  type VideoDownloadPlan,
} from "@/lib/video-download-plan";
import { parseVideoRelPath, videoRelPath } from "@/lib/video-path";

const DB_NAME = "x-idea-videos";
const DB_VERSION = 1;
const LEGACY_HANDLE_KEY = "root";

const memoryRoots = new Map<string, FileSystemDirectoryHandle>();

export function videoRootHandleKey(accountId: string): string {
  return `root:${accountId}`;
}

function directoryPickerId(accountId: string): string {
  const safe = accountId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  return safe ? `xidea-${safe}` : "x-idea-videos";
}

export function supportsDirectoryPicker(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showDirectoryPicker === "function"
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error("idb get failed"));
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction("kv", "readwrite");
      const req = tx.objectStore("kv").put(value, key);
      req.onerror = () => reject(req.error ?? new Error("idb put failed"));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("idb set failed"));
    } catch (error) {
      reject(error instanceof Error ? error : new Error("idb set failed"));
    }
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb del failed"));
  });
}

async function openDirectoryPicker(
  accountId: string,
): Promise<FileSystemDirectoryHandle> {
  if (!window.showDirectoryPicker) {
    throw new Error("unsupported");
  }
  try {
    return await window.showDirectoryPicker({
      id: directoryPickerId(accountId),
      mode: "readwrite",
      startIn: "videos",
    });
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") {
      throw error;
    }
    return await window.showDirectoryPicker({ mode: "readwrite" });
  }
}

export async function persistVideoRoot(
  accountId: string,
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  try {
    await idbSet(videoRootHandleKey(accountId), handle);
    return true;
  } catch {
    return false;
  }
}

export async function pickVideoRoot(accountId: string): Promise<{
  handle: FileSystemDirectoryHandle;
  persisted: boolean;
}> {
  const handle = await openDirectoryPicker(accountId);
  memoryRoots.set(accountId, handle);
  const persisted = await persistVideoRoot(accountId, handle);
  return { handle, persisted };
}

export function peekVideoRoot(
  accountId: string | null,
): FileSystemDirectoryHandle | null {
  if (!accountId) {
    return null;
  }
  return memoryRoots.get(accountId) ?? null;
}

export async function loadVideoRoot(
  accountId: string | null,
): Promise<FileSystemDirectoryHandle | null> {
  if (!accountId) {
    return null;
  }
  const cached = memoryRoots.get(accountId);
  if (cached) {
    return cached;
  }
  try {
    const owned =
      (await idbGet<FileSystemDirectoryHandle>(
        videoRootHandleKey(accountId),
      )) ?? null;
    if (owned) {
      memoryRoots.set(accountId, owned);
      return owned;
    }
    const legacy =
      (await idbGet<FileSystemDirectoryHandle>(LEGACY_HANDLE_KEY)) ?? null;
    if (legacy) {
      memoryRoots.set(accountId, legacy);
    }
    return legacy;
  } catch {
    return null;
  }
}

export async function hasWritePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  if (!handle.queryPermission) {
    return true;
  }
  try {
    return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

export async function ensureWritePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  if (await hasWritePermission(handle)) {
    return true;
  }
  if (!handle.requestPermission) {
    return true;
  }
  try {
    return (
      (await handle.requestPermission({ mode: "readwrite" })) === "granted"
    );
  } catch {
    return false;
  }
}

async function getDir(
  parent: FileSystemDirectoryHandle,
  name: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create });
}

async function resolveRelDir(
  root: FileSystemDirectoryHandle,
  relPath: string,
  create: boolean,
): Promise<{ dir: FileSystemDirectoryHandle; fileName: string }> {
  const parsed = parseVideoRelPath(relPath);
  if (!parsed) {
    throw new Error("invalid path");
  }
  let dir = await getDir(root, parsed.accountId, create);
  if (parsed.folderName) {
    dir = await getDir(dir, parsed.folderName, create);
  }
  return { dir, fileName: parsed.fileName };
}

function progressKey(downloadId: string): string {
  return `progress:${downloadId}`;
}

export async function loadProgress(downloadId: string): Promise<number> {
  const value = await idbGet<number>(progressKey(downloadId));
  return typeof value === "number" && value > 0 ? value : 0;
}

async function saveProgress(
  downloadId: string,
  received: number,
): Promise<void> {
  await idbSet(progressKey(downloadId), received);
}

export async function clearProgress(downloadId: string): Promise<void> {
  await idbDel(progressKey(downloadId));
}

const PROGRESS_EMIT_MS = 80;
const PROGRESS_SAVE_EVERY = 1024 * 1024;

function parseTotal(res: Response, fallback: number): number {
  const range = res.headers.get("content-range");
  const match = range?.match(/\/(\d+)\s*$/);
  if (match) {
    return Number(match[1]);
  }
  const length = Number(res.headers.get("content-length") ?? 0);
  if (res.status === 200 && length > 0) {
    return length;
  }
  return fallback;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

async function writeResponseStream(
  res: Response,
  writable: FileSystemWritableFileStream,
  onBytes: (byteLength: number) => void | Promise<void>,
): Promise<number> {
  if (!res.body) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > 0) {
      await writable.write(bytes);
      await onBytes(bytes.byteLength);
    }
    return bytes.byteLength;
  }
  const reader = res.body.getReader();
  let written = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value?.byteLength) {
        continue;
      }
      await writable.write(value);
      written += value.byteLength;
      await onBytes(value.byteLength);
    }
  } finally {
    reader.releaseLock();
  }
  return written;
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function fetchVideoChunk(input: {
  mediaId: string;
  start: number;
  end: number;
  signal?: AbortSignal;
}): Promise<Response> {
  const res = await fetch(`/api/media/${input.mediaId}/file`, {
    cache: "no-store",
    headers: { Range: `bytes=${input.start}-${input.end}` },
    signal: input.signal,
  });
  if (res.status === 416) {
    return res;
  }
  if (!res.ok && res.status !== 206) {
    const error = new Error(`download failed (${res.status})`) as Error & {
      retryable?: boolean;
    };
    error.retryable = isRetryableStatus(res.status);
    throw error;
  }
  return res;
}

async function writeChunkToFile(
  file: FileSystemFileHandle,
  res: Response,
  start: number,
  onBytes: (n: number) => void | Promise<void>,
): Promise<number> {
  const writable = await file.createWritable({
    keepExistingData: true,
  });
  try {
    await writable.seek(start);
    return await writeResponseStream(res, writable, onBytes);
  } finally {
    try {
      await writable.close();
    } catch {
      // ignore
    }
  }
}

async function downloadVideoChunk(input: {
  mediaId: string;
  file: FileSystemFileHandle;
  start: number;
  end: number;
  plan: VideoDownloadPlan;
  signal?: AbortSignal;
  onBytes: (n: number) => void | Promise<void>;
}): Promise<{ written: number; status: number; total: number }> {
  let attempt = 0;
  let chunk = Math.max(VIDEO_CHUNK_MIN, input.end - input.start + 1);
  for (;;) {
    if (input.signal?.aborted) {
      throw abortError();
    }
    const end = input.start + chunk - 1;
    const chunkStart = nowMs();
    try {
      const res = await fetchVideoChunk({
        mediaId: input.mediaId,
        start: input.start,
        end,
        signal: input.signal,
      });
      if (res.status === 416) {
        return { written: 0, status: 416, total: parseTotal(res, 0) };
      }
      const written = await writeChunkToFile(
        input.file,
        res,
        input.start,
        input.onBytes,
      );
      const elapsed = (nowMs() - chunkStart) / 1000;
      if (written > 0 && elapsed > 0) {
        input.plan.chunkBytes = clamp(
          tuneVideoDownloadPlan(
            {
              chunkBytes: input.plan.chunkBytes,
              parallel: 1,
              retries: input.plan.retries,
            },
            written / elapsed,
          ).chunkBytes,
          VIDEO_CHUNK_MIN,
          VIDEO_CHUNK_MAX,
        );
      }
      return { written, status: res.status, total: parseTotal(res, 0) };
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        throw error;
      }
      attempt += 1;
      if (attempt > input.plan.retries) {
        throw error;
      }
      chunk = Math.max(VIDEO_CHUNK_MIN, Math.floor(chunk / 2));
      const delay = Math.min(10_000, 500 * 2 ** (attempt - 1));
      await sleep(delay, input.signal);
    }
  }
}

export async function downloadVideoFile(input: {
  downloadId: string;
  mediaId: string;
  relPath: string;
  root: FileSystemDirectoryHandle;
  estimatedBytes?: number | null;
  signal?: AbortSignal;
  onProgress?: (received: number, total: number) => void;
}): Promise<{ bytes: number; relPath: string }> {
  const { dir, fileName } = await resolveRelDir(
    input.root,
    input.relPath,
    true,
  );
  const file = await dir.getFileHandle(fileName, { create: true });
  let offset = await loadProgress(input.downloadId);
  if (offset > 0) {
    const existing = await file.getFile();
    if (existing.size < offset) {
      offset = existing.size;
    }
  }

  const plan = initialVideoDownloadPlan(input.estimatedBytes);
  let total = 0;
  let lastEmit = 0;
  let lastSaved = offset;
  const emit = (force = false) => {
    if (!input.onProgress) {
      return;
    }
    const now = nowMs();
    if (!force && now - lastEmit < PROGRESS_EMIT_MS) {
      return;
    }
    lastEmit = now;
    input.onProgress(offset, total);
  };
  const onBytes = async (n: number) => {
    offset += n;
    emit();
    if (offset - lastSaved >= PROGRESS_SAVE_EVERY) {
      await saveProgress(input.downloadId, offset);
      lastSaved = offset;
    }
  };
  emit(true);

  const persist = async () => {
    await saveProgress(input.downloadId, offset);
    lastSaved = offset;
  };

  try {
    while (!input.signal?.aborted) {
      if (total > 0 && offset >= total) {
        break;
      }
      const chunkSize = clamp(
        plan.chunkBytes,
        VIDEO_CHUNK_MIN,
        VIDEO_CHUNK_MAX,
      );
      const end =
        total > 0
          ? Math.min(offset + chunkSize - 1, total - 1)
          : offset + chunkSize - 1;
      const result = await downloadVideoChunk({
        mediaId: input.mediaId,
        file,
        start: offset,
        end,
        plan,
        signal: input.signal,
        onBytes,
      });
      if (result.status === 416) {
        break;
      }
      if (result.total > 0) {
        total = result.total;
      }
      emit(true);
      if (result.written === 0) {
        break;
      }
      await persist();
      if (result.status === 200 || (total > 0 && offset >= total)) {
        break;
      }
    }
    if (input.signal?.aborted) {
      throw abortError();
    }
    await persist();
    await clearProgress(input.downloadId);
    return { bytes: offset, relPath: input.relPath };
  } catch (error) {
    await persist().catch(() => {});
    throw error;
  }
}

export async function moveVideoFile(
  root: FileSystemDirectoryHandle,
  fromPath: string,
  toPath: string,
): Promise<void> {
  if (fromPath === toPath) {
    return;
  }
  const from = await resolveRelDir(root, fromPath, false);
  const to = await resolveRelDir(root, toPath, true);
  const src = await from.dir.getFileHandle(from.fileName);
  const dest = await to.dir.getFileHandle(to.fileName, { create: true });
  const blob = await src.getFile();
  const writable = await dest.createWritable();
  await writable.write(await blob.arrayBuffer());
  await writable.close();
  await from.dir.removeEntry(from.fileName);
}

export async function deleteVideoFile(
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<void> {
  const { dir, fileName } = await resolveRelDir(root, relPath, false);
  await dir.removeEntry(fileName);
}

export async function openVideoObjectUrl(
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<string> {
  const { dir, fileName } = await resolveRelDir(root, relPath, false);
  const handle = await dir.getFileHandle(fileName);
  const file = await handle.getFile();
  return URL.createObjectURL(file);
}

export function suggestedRelPath(item: {
  accountId: string;
  folderName?: string | null;
  tweetId: string;
  mediaKey: string;
}): string {
  return videoRelPath(item);
}
