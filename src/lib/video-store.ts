import {
  probeDirectTotalBytes,
  VIDEO_CDN_FETCH_INIT,
} from "@/lib/video-direct-fetch";
import {
  DIRECT_PARALLEL,
  directChunkBytes,
  initialVideoDownloadPlan,
  shouldAvoidProxyFallback,
  shouldUseVideoTailSidecar,
  tuneVideoDownloadPlan,
  VIDEO_CHUNK_MAX,
  VIDEO_CHUNK_MIN,
  VIDEO_DIRECT_LOOKAHEAD_BYTES,
  VIDEO_LARGE_RESUME_BYTES,
  VIDEO_STALL_MS,
  VIDEO_URL_RESOLVE_MS,
  VIDEO_WRITE_TIMEOUT_MS,
  type VideoDownloadPlan,
  videoFileSourceRange,
  videoOpenTimeoutMs,
} from "@/lib/video-download-plan";
import {
  isFinishedVideoDownload,
  leftoverVideoRelPaths,
  resumeVideoOffset,
  resumeVideoTailOffset,
} from "@/lib/video-files";
import {
  isSafeVideoRelPath,
  parseVideoRelPath,
  videoRelPath,
  videoTailPartFileName,
} from "@/lib/video-path";

export type VideoDownloadPhase = "opening" | "downloading" | "merging";

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
  signal?: AbortSignal,
): Promise<number> {
  if (signal?.aborted) {
    throw abortError();
  }
  if (!res.body) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (signal?.aborted) {
      throw abortError();
    }
    if (bytes.byteLength > 0) {
      await withTimeout(
        writable.write(bytes),
        VIDEO_WRITE_TIMEOUT_MS,
        "ファイルへの書き込み",
      );
      await onBytes(bytes.byteLength);
    }
    return bytes.byteLength;
  }
  const reader = res.body.getReader();
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  let written = 0;
  try {
    while (true) {
      if (signal?.aborted) {
        throw abortError();
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value?.byteLength) {
        continue;
      }
      if (signal?.aborted) {
        throw abortError();
      }
      await withTimeout(
        writable.write(value),
        VIDEO_WRITE_TIMEOUT_MS,
        "ファイルへの書き込み",
      );
      written += value.byteLength;
      await onBytes(value.byteLength);
    }
    // abort による reader.cancel() は read を done で解決するため、
    // 中断（スタール切断を含む）を正常終了と区別する
    if (signal?.aborted) {
      throw abortError();
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      // cancel() 済みだと releaseLock が失敗することがある
    }
  }
  return written;
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

async function closeWritable(
  writable: FileSystemWritableFileStream,
): Promise<void> {
  try {
    await withTimeout(
      writable.close(),
      VIDEO_WRITE_TIMEOUT_MS,
      "ファイルのクローズ",
    );
  } catch {
    // ignore
  }
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string }).name === "AbortError";
}

/** スタール尽きなど、転送が応答しなくなったときの専用エラー文 */
const STALL_EXHAUSTED_MESSAGE = "ダウンロードが止まりました（応答なし）";

/**
 * File System Access の呼び出しが応答しなくなったときに備えるタイムアウト。
 * タイムアウトしても元の Promise は残るが、進捗は保存済み位置までなので
 * 次回のレジュームで上書きされる。ハートビートは進捗があるときだけ送る
 * （ADR-025 改定）ため、固まったままリースを持ち続けることもない。
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(`${label}が応答しません（${Math.round(ms / 1000)}秒）`),
        ),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
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

type DownloadError = Error & { retryable?: boolean; status?: number };

function downloadError(message: string, status: number): DownloadError {
  const error = new Error(message) as DownloadError;
  error.retryable = isRetryableStatus(status);
  error.status = status;
  return error;
}

async function fetchProxyVideoChunk(input: {
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
    throw downloadError(`download failed (${res.status})`, res.status);
  }
  return res;
}

async function fetchDirectVideoChunk(
  url: string,
  start: number,
  end: number,
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch(url, {
    ...VIDEO_CDN_FETCH_INIT,
    headers: { Range: `bytes=${start}-${end}` },
    signal,
  });
  if (res.status === 416 || res.status === 206) {
    return res;
  }
  if (res.status === 200 && start === 0) {
    return res;
  }
  const error = downloadError(
    `direct range failed (${res.status})`,
    res.status,
  );
  throw error;
}

async function fetchVideoChunk(input: {
  mediaId: string;
  start: number;
  end: number;
  signal?: AbortSignal;
  directUrl?: string | null;
  onDirectFailed?: () => void;
}): Promise<Response> {
  if (input.directUrl) {
    try {
      return await fetchDirectVideoChunk(
        input.directUrl,
        input.start,
        input.end,
        input.signal,
      );
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        throw error;
      }
      if ((error as { retryable?: boolean }).retryable) {
        throw error;
      }
      input.onDirectFailed?.();
    }
  }
  return fetchProxyVideoChunk(input);
}

/**
 * 開き済みの writable に 1 チャンクを書く。createWritable({keepExistingData:true})
 * は既存内容を一時ファイルへコピーするため、チャンクごとに開き直すと
 * ファイルが大きくなるほど急激に遅くなる（ADR-026）。writable は呼び出し側が
 * 1 回だけ開いて使い回す。
 */
async function writeChunkToWritable(
  writable: FileSystemWritableFileStream,
  res: Response,
  start: number,
  onBytes: (n: number) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<number> {
  if (signal?.aborted) {
    throw abortError();
  }
  await withTimeout(
    writable.seek(start),
    VIDEO_WRITE_TIMEOUT_MS,
    "ファイルのシーク",
  );
  return writeResponseStream(res, writable, onBytes, signal);
}

async function downloadVideoChunk(input: {
  mediaId: string;
  writable: FileSystemWritableFileStream;
  start: number;
  end: number;
  /** ファイル上の書き込み位置。省略時は CDN の start と同じ */
  fileOffset?: number;
  plan: VideoDownloadPlan;
  signal?: AbortSignal;
  onBytes: (n: number) => void | Promise<void>;
  directUrl?: string | null;
  onDirectFailed?: () => void;
}): Promise<{ written: number; status: number; total: number }> {
  let attempt = 0;
  let chunk = Math.max(VIDEO_CHUNK_MIN, input.end - input.start + 1);
  let directUrl = input.directUrl ?? null;
  for (;;) {
    if (input.signal?.aborted) {
      throw abortError();
    }
    const end = input.start + chunk - 1;
    const chunkStart = nowMs();
    // 無応答検知: VIDEO_STALL_MS のあいだ 1 バイトも来なければ切断してリトライする
    // （ユーザーの停止 signal とは別の AbortController で区別する）
    const stallController = new AbortController();
    let stalled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const armStallTimer = () => {
      if (stallTimer) {
        clearTimeout(stallTimer);
      }
      stallTimer = setTimeout(() => {
        stalled = true;
        stallController.abort();
      }, VIDEO_STALL_MS);
    };
    const onParentAbort = () => stallController.abort();
    input.signal?.addEventListener("abort", onParentAbort, { once: true });
    armStallTimer();
    const onBytes = async (n: number) => {
      armStallTimer();
      await input.onBytes(n);
    };
    try {
      const res = await fetchVideoChunk({
        mediaId: input.mediaId,
        start: input.start,
        end,
        signal: stallController.signal,
        directUrl,
        onDirectFailed: () => {
          directUrl = null;
          input.onDirectFailed?.();
        },
      });
      if (res.status === 416) {
        return { written: 0, status: 416, total: parseTotal(res, 0) };
      }
      if (input.signal?.aborted) {
        throw abortError();
      }
      // 本文の読み込みにもスタール検知を効かせる。input.signal を渡すと
      // ヘッダ到達後に転送が止まったとき検知できず、無期限に固まる
      const written = await writeChunkToWritable(
        input.writable,
        res,
        input.fileOffset ?? input.start,
        onBytes,
        stallController.signal,
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
      if (input.signal?.aborted) {
        throw abortError();
      }
      attempt += 1;
      if (attempt > input.plan.retries) {
        throw stalled ? new Error(STALL_EXHAUSTED_MESSAGE) : error;
      }
      chunk = Math.max(VIDEO_CHUNK_MIN, Math.floor(chunk / 2));
      // 5xx はサーバー側の回復に時間がかかるので長めに待つ（ADR-026）
      const status = (error as DownloadError).status;
      const delay =
        status != null && status >= 500
          ? Math.min(30_000, 2_000 * 2 ** (attempt - 1))
          : Math.min(10_000, 500 * 2 ** (attempt - 1));
      await sleep(delay, input.signal);
    } finally {
      if (stallTimer) {
        clearTimeout(stallTimer);
      }
      input.signal?.removeEventListener("abort", onParentAbort);
    }
  }
}

/**
 * CDN 直接取得の総サイズ。サーバーが返した bytes を優先し、
 * 無ければブラウザで HEAD → Range 0-0 を試す（ADR-021）。
 */
async function resolveDirectTotalBytes(input: {
  url: string;
  hintedBytes?: number | null;
  signal?: AbortSignal;
}): Promise<number | null> {
  if (input.hintedBytes && input.hintedBytes > 0) {
    return input.hintedBytes;
  }
  // プローブが固まっても先に進めるようタイムアウトを付ける。
  // タイムアウト時は「サイズ不明」として逐次経路へ進む。
  // ユーザーの停止シグナルだけは中断として上に投げる
  const combined = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(VIDEO_URL_RESOLVE_MS)])
    : AbortSignal.timeout(VIDEO_URL_RESOLVE_MS);
  try {
    return await probeDirectTotalBytes(input.url, combined);
  } catch (error) {
    if (input.signal?.aborted) {
      throw error;
    }
    return null;
  }
}

/**
 * 1 レンジをメモリ上に取得する。ストール検知・指数バックオフは
 * プロキシ経路（downloadVideoChunk）と同じ方針。リトライ時は
 * 受信済みバイトを onBytes の負数で巻き戻して進捗の二重計上を防ぐ。
 */
async function fetchRangeBytes(input: {
  url: string;
  start: number;
  end: number;
  retries: number;
  signal?: AbortSignal;
  onBytes: (n: number) => void;
}): Promise<Uint8Array<ArrayBuffer>> {
  const expected = input.end - input.start + 1;
  let attempt = 0;
  for (;;) {
    if (input.signal?.aborted) {
      throw abortError();
    }
    const stallController = new AbortController();
    let stalled = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const armStallTimer = () => {
      if (stallTimer) {
        clearTimeout(stallTimer);
      }
      stallTimer = setTimeout(() => {
        stalled = true;
        stallController.abort();
      }, VIDEO_STALL_MS);
    };
    const onParentAbort = () => stallController.abort();
    input.signal?.addEventListener("abort", onParentAbort, { once: true });
    armStallTimer();
    let received = 0;
    try {
      const res = await fetch(input.url, {
        ...VIDEO_CDN_FETCH_INIT,
        headers: { Range: `bytes=${input.start}-${input.end}` },
        signal: stallController.signal,
      });
      // Range を無視した 200 などは並列方式と相性が悪いので失敗扱いにし、
      // 呼び出し側のプロキシ経路フォールバックに任せる
      if (res.status !== 206 || !res.body) {
        throw downloadError(`direct range failed (${res.status})`, res.status);
      }
      const reader = res.body.getReader();
      const parts: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (!value?.byteLength) {
            continue;
          }
          armStallTimer();
          parts.push(value);
          received += value.byteLength;
          input.onBytes(value.byteLength);
        }
      } finally {
        reader.releaseLock();
      }
      if (received !== expected) {
        const error = new Error(
          `direct range short read (${received}/${expected})`,
        ) as Error & { retryable?: boolean };
        error.retryable = true;
        throw error;
      }
      const out = new Uint8Array(received);
      let at = 0;
      for (const part of parts) {
        out.set(part, at);
        at += part.byteLength;
      }
      return out;
    } catch (error) {
      if (received > 0) {
        input.onBytes(-received);
      }
      if (input.signal?.aborted) {
        throw abortError();
      }
      attempt += 1;
      const retryable = (error as { retryable?: boolean }).retryable !== false;
      if (attempt > input.retries || !retryable) {
        // スタール尽きは専用エラーに変換する。AbortError のまま上がると
        // 呼び出し側で「ユーザーの停止」と誤判定され、failed に落ちず
        // 順次/proxy 経路へのフォールバックも効かない
        if (stalled) {
          throw new Error(STALL_EXHAUSTED_MESSAGE);
        }
        throw error;
      }
      // 5xx はサーバー側の回復に時間がかかるので長めに待つ（ADR-026）
      const status = (error as DownloadError).status;
      const delay =
        status != null && status >= 500
          ? Math.min(30_000, 2_000 * 2 ** (attempt - 1))
          : Math.min(10_000, 500 * 2 ** (attempt - 1));
      await sleep(delay, input.signal);
    } finally {
      if (stallTimer) {
        clearTimeout(stallTimer);
      }
      input.signal?.removeEventListener("abort", onParentAbort);
    }
  }
}

/**
 * CDN から DIRECT_PARALLEL 本の並列 Range 取得でダウンロードする。
 * File System Access は 1 ファイル同時 1 writable なので、取得は並列・
 * 書き込みはオフセット順に直列化する。返り値は書き込み済みの最終オフセット。
 */
async function downloadDirectToFile(input: {
  url: string;
  file: FileSystemFileHandle;
  offset: number;
  total: number;
  retries: number;
  signal?: AbortSignal;
  onBytes: (n: number) => void;
  onWritten: (offset: number) => Promise<void>;
  /** ファイル先頭に対応する CDN バイト位置。サイドカー用 */
  sourceOffset?: number;
  onPhase?: (phase: VideoDownloadPhase) => void;
}): Promise<number> {
  const chunk = directChunkBytes(input.total);
  const existingBytes = input.offset;
  const sourceOffset = input.sourceOffset ?? 0;
  if (existingBytes >= VIDEO_LARGE_RESUME_BYTES && sourceOffset === 0) {
    input.onPhase?.("opening");
  }
  const writable = await withTimeout(
    input.file.createWritable({
      keepExistingData: existingBytes > 0,
    }),
    videoOpenTimeoutMs(existingBytes),
    "保存ファイルの準備",
  );
  input.onPhase?.("downloading");
  if (input.signal?.aborted) {
    await closeWritable(writable);
    throw abortError();
  }
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  input.signal?.addEventListener("abort", onParentAbort, { once: true });
  let nextFetch = input.offset;
  let nextWrite = input.offset;
  const pending = new Map<number, Uint8Array<ArrayBuffer>>();
  let writeChain: Promise<void> = Promise.resolve();
  // 背圧: 書き込み位置からの先読みを VIDEO_DIRECT_LOOKAHEAD_BYTES に制限する。
  // 1 レーンだけ停滞すると未書き込みチャンクがメモリに溜まり続け、
  // タブ全体が不安定になるのを防ぐ。レンジは若い順に割り当てるため、
  // nextWrite を含むチャンクは必ず割り当て済み（= 待たずに進む）ので
  // デッドロックしない。
  const waiters = new Set<() => void>();
  const wakeWaiters = () => {
    for (const wake of [...waiters]) {
      wake();
    }
  };
  const waitForWindow = async () => {
    while (nextFetch - nextWrite >= VIDEO_DIRECT_LOOKAHEAD_BYTES) {
      if (controller.signal.aborted) {
        throw abortError();
      }
      await new Promise<void>((resolve) => {
        const wake = () => {
          waiters.delete(wake);
          controller.signal.removeEventListener("abort", wake);
          resolve();
        };
        waiters.add(wake);
        controller.signal.addEventListener("abort", wake, { once: true });
      });
    }
  };
  const flush = () => {
    writeChain = writeChain.then(async () => {
      if (controller.signal.aborted) {
        return;
      }
      for (;;) {
        if (controller.signal.aborted) {
          return;
        }
        const data = pending.get(nextWrite);
        if (!data) {
          return;
        }
        pending.delete(nextWrite);
        await withTimeout(
          writable.seek(nextWrite),
          VIDEO_WRITE_TIMEOUT_MS,
          "ファイルのシーク",
        );
        await withTimeout(
          writable.write(data),
          VIDEO_WRITE_TIMEOUT_MS,
          "ファイルへの書き込み",
        );
        nextWrite += data.byteLength;
        wakeWaiters();
        await input.onWritten(nextWrite);
      }
    });
    return writeChain;
  };
  const worker = async () => {
    for (;;) {
      if (controller.signal.aborted) {
        throw abortError();
      }
      await waitForWindow();
      const start = nextFetch;
      if (start >= input.total) {
        return;
      }
      const end = Math.min(start + chunk, input.total) - 1;
      nextFetch = end + 1;
      const range = videoFileSourceRange(start, end, sourceOffset);
      const data = await fetchRangeBytes({
        url: input.url,
        start: range.start,
        end: range.end,
        retries: input.retries,
        signal: controller.signal,
        onBytes: input.onBytes,
      });
      pending.set(start, data);
      await flush();
    }
  };
  try {
    const results = await Promise.all(
      Array.from({ length: DIRECT_PARALLEL }, async () => {
        try {
          await worker();
          return null;
        } catch (error) {
          controller.abort();
          return error;
        }
      }),
    );
    // 中断かどうかは「ユーザーの停止シグナル」だけで判定する。
    // ワーカー失敗の連鎖 abort（controller.signal）やスタール尽きを
    // ユーザー停止と誤判定すると、failed に落ちず再開の手がかりが消える
    const failure =
      results.find((error) => error != null && !isAbortError(error)) ??
      results.find((error) => error != null);
    if (input.signal?.aborted) {
      // 停止時は未書き込みチャンクを捨てて close に進む。flush すると
      // 最大 32MB を書いてから閉じることになり、停止が遅れる。
      // 進行中の 1 書き込みだけ待ってから閉じる（未着手の pending は捨てる）
      await writeChain.catch(() => undefined);
      throw abortError();
    }
    await flush();
    if (failure) {
      throw failure;
    }
    if (nextWrite < input.total) {
      throw new Error(
        `ダウンロードが完了しませんでした（${nextWrite}/${input.total}）`,
      );
    }
    return nextWrite;
  } finally {
    input.signal?.removeEventListener("abort", onParentAbort);
    await closeWritable(writable);
  }
}

async function writeBlobToWritable(
  writable: FileSystemWritableFileStream,
  blob: Blob,
  signal?: AbortSignal,
  onBytes?: (n: number) => void | Promise<void>,
): Promise<void> {
  if (signal?.aborted) {
    throw abortError();
  }
  if (typeof blob.stream !== "function") {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (signal?.aborted) {
      throw abortError();
    }
    if (bytes.byteLength > 0) {
      await withTimeout(
        writable.write(bytes),
        VIDEO_WRITE_TIMEOUT_MS,
        "ファイルへの書き込み",
      );
      await onBytes?.(bytes.byteLength);
    }
    return;
  }
  const reader = blob.stream().getReader();
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) {
        throw abortError();
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value?.byteLength) {
        continue;
      }
      if (signal?.aborted) {
        throw abortError();
      }
      await withTimeout(
        writable.write(value),
        VIDEO_WRITE_TIMEOUT_MS,
        "ファイルへの書き込み",
      );
      await onBytes?.(value.byteLength);
    }
    if (signal?.aborted) {
      throw abortError();
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      // cancel() 済みだと releaseLock が失敗することがある
    }
  }
}

/**
 * サイドカーへ残りを逐次で書く。本体の keepExistingData 全コピーはしない。
 */
async function downloadSequentialToFile(input: {
  mediaId: string;
  file: FileSystemFileHandle;
  fileOffset: number;
  sourceStart: number;
  sourceEnd: number;
  plan: VideoDownloadPlan;
  signal?: AbortSignal;
  onBytes: (n: number) => void | Promise<void>;
  onFileOffset: (fileOffset: number) => Promise<void>;
  onTotal?: (total: number) => void;
  directUrl?: string | null;
  onDirectFailed?: () => void;
}): Promise<number> {
  const existing = input.fileOffset;
  const writable = await withTimeout(
    input.file.createWritable({ keepExistingData: existing > 0 }),
    videoOpenTimeoutMs(existing),
    "保存ファイルの準備",
  );
  try {
    if (input.signal?.aborted) {
      throw abortError();
    }
    await withTimeout(
      writable.seek(input.fileOffset),
      VIDEO_WRITE_TIMEOUT_MS,
      "ファイルのシーク",
    );
    let fileOffset = input.fileOffset;
    let sourcePos = input.sourceStart;
    let sourceEnd = input.sourceEnd;
    while (!input.signal?.aborted) {
      if (sourceEnd > 0 && sourcePos >= sourceEnd) {
        break;
      }
      const chunkSize = clamp(
        input.plan.chunkBytes,
        VIDEO_CHUNK_MIN,
        VIDEO_CHUNK_MAX,
      );
      const end =
        sourceEnd > 0
          ? Math.min(sourcePos + chunkSize - 1, sourceEnd - 1)
          : sourcePos + chunkSize - 1;
      const result = await downloadVideoChunk({
        mediaId: input.mediaId,
        writable,
        start: sourcePos,
        end,
        fileOffset,
        plan: input.plan,
        signal: input.signal,
        onBytes: input.onBytes,
        directUrl: input.directUrl,
        onDirectFailed: input.onDirectFailed,
      });
      if (result.status === 416) {
        break;
      }
      if (result.total > 0) {
        sourceEnd = result.total;
        input.onTotal?.(result.total);
      }
      if (result.written === 0) {
        break;
      }
      fileOffset += result.written;
      sourcePos += result.written;
      await input.onFileOffset(fileOffset);
      if (result.status === 200 || (sourceEnd > 0 && sourcePos >= sourceEnd)) {
        break;
      }
    }
    if (input.signal?.aborted) {
      throw abortError();
    }
    return fileOffset;
  } finally {
    await closeWritable(writable);
  }
}

async function appendSidecarToMainFile(input: {
  file: FileSystemFileHandle;
  sidecar: FileSystemFileHandle;
  mainOffset: number;
  maxBytes?: number;
  signal?: AbortSignal;
  onBytes?: (n: number) => void | Promise<void>;
  onPhase?: (phase: VideoDownloadPhase) => void;
}): Promise<void> {
  input.onPhase?.("merging");
  const raw = await withTimeout(
    input.sidecar.getFile(),
    VIDEO_WRITE_TIMEOUT_MS,
    "保存ファイルの確認",
  );
  const blob =
    input.maxBytes != null && raw.size > input.maxBytes
      ? raw.slice(0, input.maxBytes)
      : raw;
  if (!(blob.size > 0)) {
    throw new Error("結合する途中ファイルが空です");
  }
  const writable = await withTimeout(
    input.file.createWritable({ keepExistingData: true }),
    videoOpenTimeoutMs(input.mainOffset),
    "保存ファイルの準備",
  );
  try {
    if (input.signal?.aborted) {
      throw abortError();
    }
    await withTimeout(
      writable.seek(input.mainOffset),
      VIDEO_WRITE_TIMEOUT_MS,
      "ファイルのシーク",
    );
    await writeBlobToWritable(writable, blob, input.signal, input.onBytes);
  } finally {
    await closeWritable(writable);
  }
}

/**
 * 大きな途中ファイルは残りを .part へ先に取る。
 * 本体の keepExistingData 全コピーは、残りが揃ってからの結合だけ。
 * これにより「URL 取得 → 4GB コピー中に URL 失効 → 応答なし → またコピー」
 * のループを避ける（ADR-026）。
 */
async function downloadViaTailSidecar(input: {
  dir: FileSystemDirectoryHandle;
  file: FileSystemFileHandle;
  fileName: string;
  mainOffset: number;
  total: number;
  mediaId: string;
  plan: VideoDownloadPlan;
  directUrl: string | null;
  refreshDirectUrl?: () => Promise<{
    url: string;
    bytes: number | null;
  } | null>;
  signal?: AbortSignal;
  onProgress?: (received: number, total: number) => void;
  onPhase?: (phase: VideoDownloadPhase) => void;
}): Promise<number> {
  const partName = videoTailPartFileName(input.fileName);
  const sidecar = await input.dir.getFileHandle(partName, { create: true });
  let total = input.total;
  const remaining = () =>
    total > input.mainOffset ? total - input.mainOffset : 0;
  let tailOffset = resumeVideoTailOffset(
    (
      await withTimeout(
        sidecar.getFile(),
        VIDEO_WRITE_TIMEOUT_MS,
        "保存ファイルの確認",
      )
    ).size,
    remaining() || Number.MAX_SAFE_INTEGER,
  );
  if (remaining() > 0) {
    tailOffset = resumeVideoTailOffset(tailOffset, remaining());
  }

  let lastEmit = 0;
  const emit = (force = false) => {
    if (!input.onProgress) {
      return;
    }
    const now = nowMs();
    if (!force && now - lastEmit < PROGRESS_EMIT_MS) {
      return;
    }
    lastEmit = now;
    input.onProgress(input.mainOffset + tailOffset, total);
  };
  emit(true);
  input.onPhase?.("downloading");

  const persistTailFromFile = async () => {
    const size = (
      await withTimeout(
        sidecar.getFile(),
        VIDEO_WRITE_TIMEOUT_MS,
        "保存ファイルの確認",
      )
    ).size;
    tailOffset =
      remaining() > 0 ? resumeVideoTailOffset(size, remaining()) : size;
    emit(true);
  };

  const needMore = () => remaining() === 0 || tailOffset < remaining();

  if (needMore()) {
    let directUrl = input.directUrl;
    let refreshed = false;
    let preferSequential = false;
    for (;;) {
      if (input.signal?.aborted) {
        throw abortError();
      }
      try {
        if (
          !preferSequential &&
          directUrl &&
          remaining() > 0 &&
          tailOffset < remaining()
        ) {
          const written = await downloadDirectToFile({
            url: directUrl,
            file: sidecar,
            offset: tailOffset,
            total: remaining(),
            sourceOffset: input.mainOffset,
            retries: input.plan.retries,
            signal: input.signal,
            onBytes: (n) => {
              tailOffset += n;
              emit();
            },
            onWritten: async (writtenOffset) => {
              tailOffset = writtenOffset;
              emit(true);
            },
            onPhase: input.onPhase,
          });
          tailOffset = written;
          emit(true);
          break;
        }
        const written = await downloadSequentialToFile({
          mediaId: input.mediaId,
          file: sidecar,
          fileOffset: tailOffset,
          sourceStart: input.mainOffset + tailOffset,
          sourceEnd: total,
          plan: input.plan,
          signal: input.signal,
          onBytes: (n) => {
            tailOffset += n;
            emit();
          },
          onFileOffset: async (fileOffset) => {
            tailOffset = fileOffset;
            emit(true);
          },
          onTotal: (nextTotal) => {
            if (nextTotal > 0) {
              total = nextTotal;
            }
          },
          directUrl,
          onDirectFailed: () => {
            directUrl = null;
          },
        });
        tailOffset = written;
        emit(true);
        break;
      } catch (error) {
        if (isAbortError(error) || input.signal?.aborted) {
          throw abortError();
        }
        await persistTailFromFile();
        if (!refreshed && input.refreshDirectUrl) {
          const refreshedUrl = await input.refreshDirectUrl().catch(() => null);
          if (refreshedUrl?.url) {
            refreshed = true;
            directUrl = refreshedUrl.url;
            if (refreshedUrl.bytes && refreshedUrl.bytes > 0) {
              total = refreshedUrl.bytes;
            }
            continue;
          }
        }
        if (!preferSequential) {
          preferSequential = true;
          continue;
        }
        throw error;
      }
    }
  }

  await persistTailFromFile();
  if (remaining() > 0 && tailOffset < remaining()) {
    throw new Error(
      `ダウンロードが完了しませんでした（${input.mainOffset + tailOffset}/${total}）`,
    );
  }
  if (!(tailOffset > 0) && remaining() > 0) {
    throw new Error("ダウンロードが完了しませんでした");
  }

  if (tailOffset > 0) {
    let merged = 0;
    await appendSidecarToMainFile({
      file: input.file,
      sidecar,
      mainOffset: input.mainOffset,
      maxBytes: remaining() > 0 ? remaining() : undefined,
      signal: input.signal,
      onBytes: (n) => {
        merged += n;
        if (input.onProgress) {
          input.onProgress(input.mainOffset + merged, total);
        }
      },
      onPhase: input.onPhase,
    });
    try {
      await input.dir.removeEntry(partName);
    } catch {
      // 結合済みなら残り掃除で消える
    }
  }

  const finalBytes = input.mainOffset + tailOffset;
  if (!isFinishedVideoDownload(finalBytes, total)) {
    throw new Error(
      total > 0
        ? `ダウンロードが完了しませんでした（${finalBytes}/${total}）`
        : "ダウンロードが完了しませんでした",
    );
  }
  return finalBytes;
}

export async function downloadVideoFile(input: {
  downloadId: string;
  mediaId: string;
  relPath: string;
  root: FileSystemDirectoryHandle;
  estimatedBytes?: number | null;
  /** あれば CDN から直接・並列で取得し、失敗時はプロキシ経路へ落ちる（ADR-021） */
  directUrl?: string | null;
  /** `/url` がサーバー側で読んだ総バイト。HEAD なしでも並列できる */
  directBytes?: number | null;
  /** CDN URL の取り直し（期限切れ・一時障害からの回復用。ADR-026） */
  refreshDirectUrl?: () => Promise<{
    url: string;
    bytes: number | null;
  } | null>;
  signal?: AbortSignal;
  onProgress?: (received: number, total: number) => void;
  onPhase?: (phase: VideoDownloadPhase) => void;
}): Promise<{ bytes: number; relPath: string }> {
  const { dir, fileName } = await resolveRelDir(
    input.root,
    input.relPath,
    true,
  );
  const file = await dir.getFileHandle(fileName, { create: true });
  let offset = resumeVideoOffset(
    await loadProgress(input.downloadId),
    (
      await withTimeout(
        file.getFile(),
        VIDEO_WRITE_TIMEOUT_MS,
        "保存ファイルの確認",
      )
    ).size,
  );

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

  /** IndexedDB の保存済み位置から offset を復元する */
  const restoreOffset = async () => {
    offset = resumeVideoOffset(
      await loadProgress(input.downloadId),
      (
        await withTimeout(
          file.getFile(),
          VIDEO_WRITE_TIMEOUT_MS,
          "保存ファイルの確認",
        )
      ).size,
    );
    lastSaved = offset;
  };

  let directUrl = input.directUrl ?? null;
  const disableDirect = () => {
    directUrl = null;
  };

  // CDN 直接・並列取得を先に試す（ADR-021）。
  // video.twimg.com はコネクション単位のスロットルのため、並列 Range の方が
  // プロキシ逐次より桁違いに速い。失敗時は書き込み済み位置から
  // CDN 逐次→プロキシ逐次へ落ちる。
  const runOnce = async (): Promise<{ bytes: number; relPath: string }> => {
    if (directUrl && !input.signal?.aborted) {
      const knownTotal = await resolveDirectTotalBytes({
        url: directUrl,
        hintedBytes: input.directBytes,
        signal: input.signal,
      });
      if (knownTotal && knownTotal <= offset) {
        // すでに取り終わっている（完了登録だけ失敗したケース）
        return { bytes: offset, relPath: input.relPath };
      }
      if (knownTotal && knownTotal > offset) {
        total = knownTotal;
        emit(true);
      }
    }

    if (shouldUseVideoTailSidecar(offset)) {
      const written = await downloadViaTailSidecar({
        dir,
        file,
        fileName,
        mainOffset: offset,
        total,
        mediaId: input.mediaId,
        plan,
        directUrl,
        refreshDirectUrl: input.refreshDirectUrl,
        signal: input.signal,
        onProgress: input.onProgress,
        onPhase: input.onPhase,
      });
      offset = written;
      await persist();
      return { bytes: offset, relPath: input.relPath };
    }

    if (directUrl && total > offset && !input.signal?.aborted) {
      try {
        const written = await downloadDirectToFile({
          url: directUrl,
          file,
          offset,
          total,
          retries: plan.retries,
          signal: input.signal,
          onPhase: input.onPhase,
          onBytes: (n) => {
            // 表示用の受信量。保存済み位置（レジューム基準）は onWritten 側だけが進める
            offset += n;
            emit();
          },
          onWritten: async (writtenOffset) => {
            await saveProgress(input.downloadId, writtenOffset);
            lastSaved = writtenOffset;
          },
        });
        offset = written;
        await persist();
        return { bytes: offset, relPath: input.relPath };
      } catch (error) {
        if (isAbortError(error) || input.signal?.aborted) {
          // 表示用 offset は未書き込み分を含むことがあるので書き込み済み位置を保存する
          await saveProgress(input.downloadId, lastSaved).catch(() => {});
          throw abortError();
        }
        await restoreOffset();
        // 大きな途中ファイルはプロキシへ落とさない。
        // もう一度 createWritable が走り、同じ全コピーのあと
        // Vercel 経由で残りを取ろうとしてまた応答なしになる
        if (shouldAvoidProxyFallback(offset)) {
          throw error;
        }
        total = 0;
        emit(true);
      }
    }

    // プロキシ逐次。createWritable は 1 回だけ開いて使い回す（ADR-026）。
    // keepExistingData: true の開き直しは既存内容の全コピーが走るため、
    // チャンクごとに開くとファイルが大きいほど急激に遅くなる。
    input.onPhase?.("opening");
    const writable = await withTimeout(
      file.createWritable({ keepExistingData: true }),
      videoOpenTimeoutMs(offset),
      "保存ファイルの準備",
    );
    input.onPhase?.("downloading");
    try {
      if (input.signal?.aborted) {
        throw abortError();
      }
      await withTimeout(
        writable.seek(offset),
        VIDEO_WRITE_TIMEOUT_MS,
        "ファイルのシーク",
      );
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
          writable,
          start: offset,
          end,
          plan,
          signal: input.signal,
          onBytes,
          directUrl,
          onDirectFailed: disableDirect,
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
      if (!isFinishedVideoDownload(offset, total)) {
        throw new Error(
          total > 0
            ? `ダウンロードが完了しませんでした（${offset}/${total}）`
            : "ダウンロードが完了しませんでした",
        );
      }
      await persist();
      // 進捗の消去は呼び出し側が完了登録を確認してから行う
      // （先に消すと、登録だけ失敗したときに最初から取り直しになる）
      return { bytes: offset, relPath: input.relPath };
    } finally {
      await closeWritable(writable);
    }
  };

  // URL 再取得で CDN 直接からやり直せるのは 1 回だけ（ADR-026）
  let refreshedUrl = false;
  for (;;) {
    try {
      return await runOnce();
    } catch (error) {
      if (isAbortError(error) || input.signal?.aborted) {
        // 表示用 offset ではなく書き込み済み位置を残す
        await saveProgress(input.downloadId, lastSaved).catch(() => {});
        throw abortError();
      }
      const retryable = (error as DownloadError).retryable !== false;
      if (!refreshedUrl && retryable && input.refreshDirectUrl) {
        const refreshed = await input.refreshDirectUrl().catch(() => null);
        if (refreshed?.url) {
          refreshedUrl = true;
          directUrl = refreshed.url;
          if (refreshed.bytes && refreshed.bytes > 0) {
            total = refreshed.bytes;
          }
          await restoreOffset();
          emit(true);
          continue;
        }
      }
      await persist().catch(() => {});
      throw error;
    }
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
  let error: unknown;
  try {
    await dir.removeEntry(fileName);
  } catch (caught) {
    error = caught;
  }
  try {
    await dir.removeEntry(videoTailPartFileName(fileName));
  } catch {
    // サイドカーが無いときは無視
  }
  if (error) {
    throw error;
  }
}

async function directoryEntries(
  dir: FileSystemDirectoryHandle,
): Promise<Array<[string, FileSystemHandle]>> {
  const entries: Array<[string, FileSystemHandle]> = [];
  const iterate = (
    dir as FileSystemDirectoryHandle & {
      entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
    }
  ).entries;
  if (!iterate) {
    return entries;
  }
  for await (const entry of iterate.call(dir)) {
    entries.push(entry);
  }
  return entries;
}

export async function listAccountVideoRelPaths(
  root: FileSystemDirectoryHandle,
  accountId: string,
): Promise<string[]> {
  let accountDir: FileSystemDirectoryHandle;
  try {
    accountDir = await root.getDirectoryHandle(accountId);
  } catch {
    return [];
  }
  const paths: string[] = [];
  for (const [name, handle] of await directoryEntries(accountDir)) {
    if (handle.kind === "file" && name.endsWith(".mp4")) {
      const relPath = `${accountId}/${name}`;
      if (isSafeVideoRelPath(relPath)) {
        paths.push(relPath);
      }
      continue;
    }
    if (handle.kind !== "directory") {
      continue;
    }
    const folder = handle as FileSystemDirectoryHandle;
    for (const [fileName, file] of await directoryEntries(folder)) {
      if (file.kind !== "file" || !fileName.endsWith(".mp4")) {
        continue;
      }
      const relPath = `${accountId}/${name}/${fileName}`;
      if (isSafeVideoRelPath(relPath)) {
        paths.push(relPath);
      }
    }
  }
  return paths;
}

export async function getVideoFile(
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<File> {
  const { dir, fileName } = await resolveRelDir(root, relPath, false);
  const handle = await dir.getFileHandle(fileName);
  return handle.getFile();
}

export async function openVideoObjectUrl(
  root: FileSystemDirectoryHandle,
  relPath: string,
): Promise<string> {
  const file = await getVideoFile(root, relPath);
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

export async function removeSavedVideoFiles(input: {
  accountId: string | null;
  relPaths: string[];
  root?: FileSystemDirectoryHandle | null;
}): Promise<{ removed: number; leftover: number }> {
  const unique = [...new Set(input.relPaths.filter((path) => path.length > 0))];
  if (unique.length === 0) {
    return { removed: 0, leftover: 0 };
  }
  if (!input.accountId || !supportsDirectoryPicker()) {
    return { removed: 0, leftover: unique.length };
  }
  const handle = input.root ?? (await loadVideoRoot(input.accountId));
  if (!handle) {
    return { removed: 0, leftover: unique.length };
  }
  if (!(await ensureWritePermission(handle))) {
    return { removed: 0, leftover: unique.length };
  }
  let removed = 0;
  for (const relPath of unique) {
    try {
      await deleteVideoFile(handle, relPath);
      removed += 1;
    } catch {
      // leftover files stay in the user's folder
    }
  }
  return { removed, leftover: unique.length - removed };
}

export async function discardPartialVideoFiles(input: {
  downloadIds?: string[];
  accountId: string | null;
  relPaths: string[];
  root?: FileSystemDirectoryHandle | null;
}): Promise<{ removed: number; leftover: number }> {
  for (const id of input.downloadIds ?? []) {
    await clearProgress(id).catch(() => undefined);
  }
  return removeSavedVideoFiles(input);
}

export async function sweepLeftoverVideoFiles(input: {
  accountId: string | null;
  protectedRelPaths: string[];
  root?: FileSystemDirectoryHandle | null;
}): Promise<{ removed: number; leftover: number }> {
  if (!input.accountId) {
    return { removed: 0, leftover: 0 };
  }
  const handle = input.root ?? (await loadVideoRoot(input.accountId));
  if (!handle) {
    return { removed: 0, leftover: 0 };
  }
  const found = await listAccountVideoRelPaths(handle, input.accountId);
  return discardPartialVideoFiles({
    accountId: input.accountId,
    relPaths: leftoverVideoRelPaths(found, input.protectedRelPaths),
    root: handle,
  });
}
