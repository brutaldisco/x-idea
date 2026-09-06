import { parseVideoRelPath, videoRelPath } from "@/lib/video-path";

const DB_NAME = "x-idea-videos";
const DB_VERSION = 1;
const HANDLE_KEY = "root";
const START_CHUNK = 8 * 1024 * 1024;
const MIN_CHUNK = 1024 * 1024;

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
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb set failed"));
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

export async function pickVideoRoot(): Promise<FileSystemDirectoryHandle> {
  if (!window.showDirectoryPicker) {
    throw new Error("unsupported");
  }
  const handle = await window.showDirectoryPicker({
    id: "x-idea-videos",
    mode: "readwrite",
    startIn: "videos",
  });
  await idbSet(HANDLE_KEY, handle);
  return handle;
}

export async function loadVideoRoot(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY)) ?? null;
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

export async function downloadVideoFile(input: {
  downloadId: string;
  mediaId: string;
  relPath: string;
  root: FileSystemDirectoryHandle;
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
  const writable = await file.createWritable({ keepExistingData: offset > 0 });
  if (offset > 0) {
    await writable.seek(offset);
  }

  let chunk = START_CHUNK;
  let fails = 0;
  let total = 0;
  try {
    while (!input.signal?.aborted) {
      const end = offset + chunk - 1;
      let res: Response;
      try {
        res = await fetch(`/api/media/${input.mediaId}/file`, {
          cache: "no-store",
          headers: { Range: `bytes=${offset}-${end}` },
          signal: input.signal,
        });
      } catch (error) {
        fails += 1;
        if (fails >= 3) {
          throw error;
        }
        chunk = Math.max(MIN_CHUNK, Math.floor(chunk / 2));
        continue;
      }
      if (res.status === 416) {
        break;
      }
      if (!res.ok && res.status !== 206) {
        fails += 1;
        if (fails >= 3) {
          throw new Error(`download failed (${res.status})`);
        }
        chunk = Math.max(MIN_CHUNK, Math.floor(chunk / 2));
        continue;
      }
      fails = 0;
      total = parseTotal(res, total);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength === 0) {
        break;
      }
      await writable.write(bytes);
      offset += bytes.byteLength;
      await saveProgress(input.downloadId, offset);
      input.onProgress?.(offset, total || offset);
      if (res.status === 200 || (total > 0 && offset >= total)) {
        break;
      }
      if (bytes.byteLength < chunk && res.status === 206) {
        if (total > 0 && offset >= total) {
          break;
        }
      }
    }
    if (input.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    await writable.close();
    await clearProgress(input.downloadId);
    return { bytes: offset, relPath: input.relPath };
  } catch (error) {
    try {
      await writable.close();
    } catch {
      // ignore
    }
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
