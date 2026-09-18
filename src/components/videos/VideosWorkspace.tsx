"use client";

import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { VideoThumbMarks } from "@/components/VideoThumbMarks";
import {
  loadRepeatMode,
  saveRepeatMode,
  VideoPlayer,
} from "@/components/videos/VideoPlayer";
import { formatBytes } from "@/lib/bytes";
import {
  mediaVideoRedirectPath,
  mediaVideoUrlApiPath,
  parseVideoSourcePayload,
} from "@/lib/media-video-api";
import {
  VIDEO_FILE_PARALLEL,
  VIDEO_HEARTBEAT_MS,
} from "@/lib/video-download-plan";
import { isIncompleteVideoFile } from "@/lib/video-files";
import { useVideoSaveFolder } from "@/lib/video-folder";
import {
  folderPlaylist,
  playlistIndex,
  type RepeatMode,
  stepPlaylist,
} from "@/lib/video-playlist";
import {
  formatDownloadSpeed,
  nextVideoDownloadSpeed,
  type VideoSpeedSample,
  videoDownloadBarPercent,
  videoDownloadByteLabel,
  videoDownloadPercent,
  videoQueueStatusLabel,
} from "@/lib/video-progress";
import {
  isResumableVideoQueueStatus,
  isVideoLeaseStale,
} from "@/lib/video-queue";
import { applyVideoItemSaveStatus } from "@/lib/video-save-status";
import {
  clearProgress,
  discardPartialVideoFiles,
  downloadVideoFile,
  ensureWritePermission,
  getVideoFile,
  hasWritePermission,
  loadVideoRoot,
  moveVideoFile,
  removeSavedVideoFiles,
  suggestedRelPath,
  sweepLeftoverVideoFiles,
} from "@/lib/video-store";
import { formatDuration, formatVideoQueueMeta } from "@/server/media/select";
import type {
  VideoFolder,
  VideoItem,
  VideoLibraryPayload,
} from "@/server/videos/queue";

type Filter = "all" | "none" | string;

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "失敗しました";
}

/** 完了登録は確実に通したいので、一時的な失敗に備えてリトライする */
async function postComplete(
  id: string,
  body: { rel_path: string; bytes: number },
): Promise<VideoItem> {
  let lastError: Error = new Error("完了の記録に失敗しました");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`/api/videos/queue/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = (await res.json()) as { item: VideoItem };
        return json.item;
      }
      lastError = new Error(`完了の記録に失敗しました (${res.status})`);
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("完了の記録に失敗しました");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  throw lastError;
}

/** 中断した項目を queued に戻す。すでに queued なら成功扱い（冪等） */
async function requeueItem(id: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`/api/videos/queue/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "requeue" }),
      });
      if (res.ok) {
        return true;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
  }
  return false;
}

export function VideosWorkspace({
  accountId,
  initial,
  initialFolderName,
  initialQueueOpen = false,
}: {
  accountId: string | null;
  initial: VideoLibraryPayload;
  initialFolderName?: string | null;
  initialQueueOpen?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { supported, linked, folderName } = useVideoSaveFolder(
    accountId,
    initialFolderName,
  );
  const [data, setData] = useState(initial);
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [progress, setProgress] = useState<
    Record<string, { received: number; total: number; bps: number | null }>
  >({});
  const speedSamplesRef = useRef<Map<string, VideoSpeedSample[]>>(new Map());
  const [playing, setPlaying] = useState<{
    item: VideoItem;
    url: string;
  } | null>(null);
  const [repeat, setRepeat] = useState<RepeatMode>("folder");
  const abortRef = useRef<AbortController | null>(null);
  const activeRef = useRef<Set<string>>(new Set());
  /** このタブが停止した項目。409 のときだけ再 queued → start してよい */
  const releasedIdsRef = useRef<Set<string>>(new Set());
  const sweptRef = useRef(false);
  const autoResumeRef = useRef(false);
  const [offlineHint, setOfflineHint] = useState(false);
  const [queueOpen, setQueueOpen] = useState(initialQueueOpen);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setData(initial);
  }, [initial]);

  useEffect(() => {
    setRepeat(loadRepeatMode());
  }, []);

  useEffect(() => {
    sweptRef.current = false;
    autoResumeRef.current = false;
    setRoot(null);
    if (!accountId) {
      return;
    }
    void loadVideoRoot(accountId).then((handle) => {
      if (handle) {
        setRoot(handle);
      }
    });
  }, [accountId]);

  useEffect(() => {
    if (sweptRef.current || !accountId || !root || !linked) {
      return;
    }
    void (async () => {
      if (!(await hasWritePermission(root))) {
        return;
      }
      sweptRef.current = true;
      const { removed } = await sweepLeftoverVideoFiles({
        accountId,
        protectedRelPaths: data.protectedRelPaths ?? [],
        root,
      });
      if (removed > 0) {
        setMessage(`開けない途中ファイルを ${removed} 件削除しました`);
      }
    })();
  }, [accountId, root, linked, data.protectedRelPaths]);

  // 前のセッションで中断したダウンロードを自動で再開する（ADR-025）。
  // 対象はリース切れの downloading だけ。queued（手動停止を含む）や
  // failed（原因を見てから再開したいもの）は自動では動かさない。
  const startDownloadsRef = useRef<((ids?: string[]) => Promise<void>) | null>(
    null,
  );
  useEffect(() => {
    startDownloadsRef.current = startDownloads;
  });
  useEffect(() => {
    if (
      autoResumeRef.current ||
      !accountId ||
      !root ||
      !linked ||
      busy ||
      !navigator.onLine
    ) {
      return;
    }
    const interrupted = data.queue.filter(
      (item) =>
        item.status === "downloading" &&
        !activeRef.current.has(item.id) &&
        isVideoLeaseStale(item.lastProgressAt),
    );
    if (interrupted.length === 0) {
      return;
    }
    autoResumeRef.current = true;
    void (async () => {
      // ページを開いただけなので許可プロンプトは出さず、許可済みのときだけ再開する
      if (!(await hasWritePermission(root))) {
        return;
      }
      setMessage(
        `中断した ${interrupted.length} 件のダウンロードを自動で再開します`,
      );
      await startDownloadsRef.current?.(interrupted.map((item) => item.id));
    })();
  }, [accountId, root, linked, busy, data.queue]);

  useEffect(() => {
    const onOffline = () => {
      // 全体は止めない。各ダウンロードが自分で失敗→再開対象に戻る（ADR-023）
      setOfflineHint(true);
    };
    const onOnline = () => {
      setOfflineHint(true);
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (playing) {
        URL.revokeObjectURL(playing.url);
      }
    };
  }, [playing]);

  // バイトが増えなくても直近ウィンドウを進めて速度を減衰させる。
  // 大きなファイルでパーセントが動かなくても、止まっているかが分かる。
  useEffect(() => {
    if (!busy) {
      return;
    }
    const timer = setInterval(() => {
      setProgress((prev) => {
        const ids = Object.keys(prev);
        if (ids.length === 0) {
          return prev;
        }
        let changed = false;
        const next = { ...prev };
        for (const id of ids) {
          const current = next[id];
          const { samples, bps } = nextVideoDownloadSpeed(
            speedSamplesRef.current.get(id) ?? [],
            current.received,
          );
          speedSamplesRef.current.set(id, samples);
          if (bps !== current.bps) {
            next[id] = { ...current, bps };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 500);
    return () => clearInterval(timer);
  }, [busy]);

  async function resolveRoot() {
    if (!accountId) {
      return null;
    }
    const handle = root ?? (await loadVideoRoot(accountId));
    if (handle) {
      setRoot(handle);
    }
    return handle;
  }

  async function refresh() {
    const res = await fetch("/api/videos/queue", { cache: "no-store" });
    if (res.ok) {
      setData((await res.json()) as VideoLibraryPayload);
    }
    router.refresh();
  }

  function itemRelPath(item: VideoItem): string {
    return item.relPath ?? suggestedRelPath(item);
  }

  function applyItemProgress(id: string, received: number, total: number) {
    const { samples, bps } = nextVideoDownloadSpeed(
      speedSamplesRef.current.get(id) ?? [],
      received,
    );
    speedSamplesRef.current.set(id, samples);
    setProgress((prev) => ({
      ...prev,
      [id]: { received, total, bps },
    }));
  }

  function clearItemProgress(id: string) {
    speedSamplesRef.current.delete(id);
    setProgress((prev) => {
      if (!(id in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function discardItemFiles(
    items: VideoItem[],
    handle?: FileSystemDirectoryHandle | null,
  ): Promise<{ removed: number; leftover: number }> {
    return discardPartialVideoFiles({
      downloadIds: items.map((item) => item.id),
      accountId: accountId ?? items[0]?.accountId ?? null,
      relPaths: items.map(itemRelPath),
      root: handle ?? root,
    });
  }

  async function startDownloads(ids?: string[]) {
    const handle = await resolveRoot();
    if (!handle) {
      setMessage("Settings で保存フォルダを選んでください");
      return;
    }
    setRoot(handle);
    if (!navigator.onLine) {
      setMessage("オフラインです。ネットワークが良い場所で実行してください");
      return;
    }
    const allowed = await ensureWritePermission(handle);
    if (!allowed) {
      setMessage("フォルダへの書き込みを許可してください");
      return;
    }
    // queued に加えて、failed（途中から再開）と、このタブで動いていない
    // downloading（中断分）も拾う。1 本の失敗で残りが止まらないようにする（ADR-023）。
    // リースが生きている downloading は別タブの実行中なので触らない（ADR-025）
    const resumable = data.queue.filter(
      (item) =>
        isResumableVideoQueueStatus(
          item.status,
          activeRef.current.has(item.id),
        ) &&
        (item.status !== "downloading" ||
          isVideoLeaseStale(item.lastProgressAt)),
    );
    const chosen = ids?.length
      ? resumable.filter((item) => ids.includes(item.id))
      : resumable;
    if (chosen.length === 0) {
      setMessage(
        ids?.length ? "選んだ動画はキューにありません" : "キューは空です",
      );
      return;
    }
    setBusy(true);
    setStopping(false);
    setMessage(null);
    setOfflineHint(false);
    const controller = new AbortController();
    abortRef.current = controller;
    const started = performance.now();
    let doneBytes = 0;
    let doneCount = 0;
    let failCount = 0;
    let skipCount = 0;
    // 1 本の内部で 4 接続を使うため、ファイル間は 2 本までに抑える。
    // 1 本が失敗・中断しても残りのワーカーは止まらない（ADR-023）
    const parallel = VIDEO_FILE_PARALLEL;
    let cursor = 0;

    const runItem = async (item: (typeof chosen)[number]) => {
      activeRef.current.add(item.id);
      const relPath = suggestedRelPath(item);
      // ハートビート（ADR-025）: 生存確認と停止位置をサーバーへ残す。
      // 進捗コールバック（バックグラウンドでも動く）とタイマーの両方から送る
      const beat = { lastAt: 0, received: 0, total: 0 };
      const sendHeartbeat = () => {
        if (controller.signal.aborted) {
          return;
        }
        const now = Date.now();
        if (now - beat.lastAt < VIDEO_HEARTBEAT_MS) {
          return;
        }
        beat.lastAt = now;
        void fetch(`/api/videos/queue/${item.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "progress",
            received: beat.received,
            total: beat.total,
          }),
        }).catch(() => undefined);
      };
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      try {
        if (controller.signal.aborted) {
          releasedIdsRef.current.add(item.id);
          await requeueItem(item.id);
          return;
        }
        let startRes = await fetch(`/api/videos/queue/${item.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
          signal: controller.signal,
        });
        if (startRes.status === 409 && releasedIdsRef.current.has(item.id)) {
          // このタブが停止した直後は、サーバーがまだ downloading のことがある
          await requeueItem(item.id);
          startRes = await fetch(`/api/videos/queue/${item.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start" }),
            signal: controller.signal,
          });
        }
        if (startRes.status === 409) {
          // 別のタブがリースを持っている（ADR-025）。失敗にはせず残す
          skipCount += 1;
          return;
        }
        if (!startRes.ok) {
          throw new Error("開始できませんでした");
        }
        releasedIdsRef.current.delete(item.id);
        applyVideoItemSaveStatus(queryClient, item, "downloading");
        setData((prev) => ({
          ...prev,
          queuedCount:
            item.status === "queued"
              ? Math.max(0, prev.queuedCount - 1)
              : prev.queuedCount,
          queue: prev.queue.map((entry) =>
            entry.id === item.id ? { ...entry, status: "downloading" } : entry,
          ),
        }));
        speedSamplesRef.current.set(item.id, []);
        setProgress((prev) => ({
          ...prev,
          [item.id]: { received: 0, total: 0, bps: null },
        }));
        heartbeatTimer = setInterval(sendHeartbeat, VIDEO_HEARTBEAT_MS);
        // CDN 直接ダウンロード用の URL を解決（失敗時はプロキシ経路で進む）
        const resolveDirectUrl = async () => {
          try {
            const urlRes = await fetch(mediaVideoUrlApiPath(item.mediaId), {
              cache: "no-store",
              signal: controller.signal,
            });
            if (urlRes.ok) {
              return parseVideoSourcePayload(await urlRes.json());
            }
          } catch (error) {
            if ((error as { name?: string }).name === "AbortError") {
              throw error;
            }
            // プロキシ経路で進む
          }
          return null;
        };
        const initial = await resolveDirectUrl();
        const directUrl = initial?.url ?? null;
        const directBytes = initial?.bytes ?? null;
        const result = await downloadVideoFile({
          downloadId: item.id,
          mediaId: item.mediaId,
          relPath,
          root: handle,
          estimatedBytes: item.estimatedBytes,
          directUrl,
          directBytes,
          // 502 等で両経路が失敗したとき、URL を取り直して CDN 直接から
          // もう一度だけ試す（ADR-026）
          refreshDirectUrl: resolveDirectUrl,
          signal: controller.signal,
          onProgress: (received, total) => {
            if (controller.signal.aborted) {
              return;
            }
            beat.received = received;
            beat.total = total;
            sendHeartbeat();
            applyItemProgress(item.id, received, total);
          },
        });
        doneBytes += result.bytes;
        doneCount += 1;
        const completed = await postComplete(item.id, {
          rel_path: result.relPath,
          bytes: result.bytes,
        });
        await clearProgress(item.id);
        // 完了したものから即座にライブラリへ出す
        clearItemProgress(item.id);
        applyVideoItemSaveStatus(
          queryClient,
          completed,
          "ready",
          completed.relPath,
        );
        setData((prev) => ({
          ...prev,
          queue: prev.queue.filter((entry) => entry.id !== item.id),
          library: [
            completed,
            ...prev.library.filter((entry) => entry.id !== item.id),
          ],
        }));
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") {
          // 停止: 途中まで保存されているので queued に戻して再開可能にする
          releasedIdsRef.current.add(item.id);
          await requeueItem(item.id);
          clearItemProgress(item.id);
          applyVideoItemSaveStatus(queryClient, item, "queued");
          setData((prev) => ({
            ...prev,
            queuedCount: prev.queue.some(
              (entry) => entry.id === item.id && entry.status === "downloading",
            )
              ? prev.queuedCount + 1
              : prev.queuedCount,
            queue: prev.queue.map((entry) =>
              entry.id === item.id ? { ...entry, status: "queued" } : entry,
            ),
          }));
          return;
        }
        failCount += 1;
        const messageText = errorMessage(error);
        await fetch(`/api/videos/queue/${item.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "fail",
            error: messageText,
          }),
        });
        // 途中ファイルと進捗（IndexedDB）は残す。「再試行」で続きから取り直せる。
        // 明示的に消したいときはキューの「途中ファイルを削除」を使う
        clearItemProgress(item.id);
        applyVideoItemSaveStatus(queryClient, item, "failed");
        setData((prev) => ({
          ...prev,
          queue: prev.queue.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "failed", error: messageText }
              : entry,
          ),
        }));
      } finally {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
        }
        activeRef.current.delete(item.id);
      }
    };

    const worker = async () => {
      while (!controller.signal.aborted) {
        const index = cursor;
        cursor += 1;
        const item = chosen[index];
        if (!item) {
          return;
        }
        await runItem(item);
      }
    };

    try {
      await Promise.all(
        Array.from({ length: Math.min(parallel, chosen.length) }, () =>
          worker(),
        ),
      );
      const elapsed = (performance.now() - started) / 1000;
      const parts: string[] = [];
      if (controller.signal.aborted) {
        parts.push("停止しました（途中まで保存済み。再開できます）");
      }
      if (doneCount > 0) {
        parts.push(`${doneCount} 件完了`);
      }
      if (failCount > 0) {
        parts.push(`${failCount} 件失敗`);
      }
      if (skipCount > 0) {
        parts.push(`${skipCount} 件は別のタブで実行中`);
      }
      if (doneBytes > 0 && elapsed > 0 && !controller.signal.aborted) {
        parts.push(
          `実測 ${(doneBytes / elapsed / 1024 / 1024).toFixed(1)} MB/s`,
        );
      }
      if (parts.length > 0) {
        setMessage(parts.join("。"));
      }
      // 停止後の一覧再取得はボタン復帰を待たせない
      if (controller.signal.aborted) {
        void refresh();
      } else {
        await refresh();
      }
    } finally {
      setStopping(false);
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stopDownloads() {
    const controller = abortRef.current;
    if (!controller || controller.signal.aborted) {
      return;
    }
    setStopping(true);
    setMessage("停止しています…");
    controller.abort();
    const ids = [...activeRef.current];
    for (const id of ids) {
      releasedIdsRef.current.add(id);
      const item = data.queue.find((entry) => entry.id === id);
      if (item) {
        applyVideoItemSaveStatus(queryClient, item, "queued");
      }
    }
    // リースをすぐ外す。失敗してもあとで再試行する
    void Promise.all(ids.map((id) => requeueItem(id)));
  }

  async function cancelItem(item: VideoItem) {
    const handle = await resolveRoot();
    await discardItemFiles([item], handle);
    await fetch(`/api/videos/queue/${item.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    applyVideoItemSaveStatus(queryClient, item, "canceled");
    await refresh();
  }

  async function cleanBrokenFiles() {
    const handle = await resolveRoot();
    if (!handle) {
      setMessage("Settings で保存フォルダを選んでください");
      return;
    }
    if (!(await ensureWritePermission(handle))) {
      setMessage("フォルダへの書き込みを許可してください");
      return;
    }
    const res = await fetch("/api/videos/queue", { cache: "no-store" });
    const payload = res.ok ? ((await res.json()) as VideoLibraryPayload) : data;
    const failed = payload.queue.filter((item) => item.status === "failed");
    const discarded = await discardPartialVideoFiles({
      downloadIds: failed.map((item) => item.id),
      accountId: accountId ?? failed[0]?.accountId ?? null,
      relPaths: failed.map(itemRelPath),
      root: handle,
    });
    const { removed } = await sweepLeftoverVideoFiles({
      accountId,
      protectedRelPaths: payload.protectedRelPaths ?? [],
      root: handle,
    });
    const total = discarded.removed + removed;
    setMessage(
      total > 0
        ? `開けない途中ファイルを ${total} 件削除しました`
        : "削除する途中ファイルはありません",
    );
    await refresh();
  }

  async function createFolder() {
    const name = window.prompt("フォルダ名");
    if (!name) {
      return;
    }
    const res = await fetch("/api/videos/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setMessage(body?.error?.message ?? "フォルダを作れませんでした");
      return;
    }
    await refresh();
  }

  async function removeFolder(folder: VideoFolder) {
    if (
      !window.confirm(
        `「${folder.name}」を削除しますか？中の動画は未分類に戻ります（ファイルは残ります）。`,
      )
    ) {
      return;
    }
    await fetch(`/api/videos/folders/${folder.id}`, { method: "DELETE" });
    if (filter === folder.id) {
      setFilter("all");
    }
    await refresh();
  }

  async function moveItem(item: VideoItem, folderId: string | null) {
    const destFolder =
      folderId == null
        ? null
        : (data.folders.find((folder) => folder.id === folderId)?.name ?? null);
    const nextPath = suggestedRelPath({
      ...item,
      folderName: destFolder,
    });
    const handle = await resolveRoot();
    if (handle && item.relPath && item.status === "ready") {
      try {
        await moveVideoFile(handle, item.relPath, nextPath);
      } catch (error) {
        setMessage(`ファイル移動に失敗しました: ${errorMessage(error)}`);
      }
    }
    await fetch(`/api/videos/${item.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id: folderId }),
    });
    await refresh();
  }

  async function removeItem(item: VideoItem) {
    if (
      !window.confirm(
        "この動画を削除しますか？保存フォルダの動画ファイル（mp4）も消えます。",
      )
    ) {
      return;
    }
    const handle = await resolveRoot();
    if (handle) {
      await ensureWritePermission(handle);
    }
    const relPath = item.relPath ?? suggestedRelPath(item);
    const { leftover } = await removeSavedVideoFiles({
      accountId: item.accountId,
      relPaths: [relPath],
      root: handle,
    });
    await fetch(`/api/videos/${item.id}`, { method: "DELETE" });
    applyVideoItemSaveStatus(queryClient, item, null, null);
    if (leftover > 0) {
      setMessage(
        "記録は削除しました。動画ファイルを消せませんでした。Settings で保存フォルダを再リンクするか、Finder で消してください。",
      );
    }
    await refresh();
  }

  async function playItem(item: VideoItem) {
    const handle = await resolveRoot();
    if (!handle || !item.relPath) {
      setMessage("Settings で保存フォルダにリンクしてから再生してください");
      return;
    }
    setRoot(handle);
    try {
      const file = await getVideoFile(handle, item.relPath);
      if (isIncompleteVideoFile(file.size, item.bytes)) {
        await discardPartialVideoFiles({
          downloadIds: [item.id],
          accountId: item.accountId,
          relPaths: [item.relPath],
          root: handle,
        });
        await fetch(`/api/videos/queue/${item.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "fail",
            error: "ファイルが途中で止まっています",
          }),
        });
        applyVideoItemSaveStatus(queryClient, item, "failed");
        setMessage(
          "途中で止まったファイルを削除しました。キューから再試行できます。",
        );
        await refresh();
        return;
      }
      const url = URL.createObjectURL(file);
      setPlaying((current) => {
        if (current) {
          URL.revokeObjectURL(current.url);
        }
        return { item, url };
      });
    } catch {
      await fetch(`/api/videos/queue/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fail",
          error: "ファイルが見つかりません",
        }),
      }).catch(() => undefined);
      applyVideoItemSaveStatus(queryClient, item, "failed");
      setMessage(
        "ファイルが見つかりません。途中ファイルは削除済みです。キューから再試行できます。",
      );
      await refresh();
    }
  }

  function changeRepeat(mode: RepeatMode) {
    setRepeat(mode);
    saveRepeatMode(mode);
  }

  function closePlayer() {
    setPlaying((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  }

  function stepPlaying(delta: number) {
    if (!playing) {
      return;
    }
    const next = stepPlaylist(playlist, playing.item.id, delta);
    if (next) {
      void playItem(next);
    }
  }

  const playlist = useMemo(() => {
    if (!playing) {
      return [];
    }
    return folderPlaylist(data.library, playing.item);
  }, [data.library, playing]);

  const visible = useMemo(() => {
    if (filter === "all") {
      return data.library;
    }
    if (filter === "none") {
      return data.library.filter((item) => !item.folderId);
    }
    return data.library.filter((item) => item.folderId === filter);
  }, [data.library, filter]);

  const queuedItems = useMemo(
    () => data.queue.filter((item) => item.status === "queued"),
    [data.queue],
  );

  // 開始対象: queued + failed（途中から再開）+ このタブで動いていない downloading（中断分）。
  // リースが生きている downloading は別タブの実行中なので除く（ADR-025）
  const resumableItems = useMemo(
    () =>
      data.queue.filter(
        (item) =>
          isResumableVideoQueueStatus(
            item.status,
            activeRef.current.has(item.id),
          ) &&
          (item.status !== "downloading" ||
            isVideoLeaseStale(item.lastProgressAt)),
      ),
    [data.queue],
  );

  useEffect(() => {
    const live = new Set(queuedItems.map((item) => item.id));
    setSelectedIds((current) => current.filter((id) => live.has(id)));
  }, [queuedItems]);

  useEffect(() => {
    if (!selectAllRef.current) {
      return;
    }
    selectAllRef.current.indeterminate =
      selectedIds.length > 0 && selectedIds.length < queuedItems.length;
  }, [selectedIds, queuedItems.length]);

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleSelectAll() {
    setSelectedIds((current) =>
      current.length === queuedItems.length
        ? []
        : queuedItems.map((item) => item.id),
    );
  }

  const eta = useMemo(() => {
    const targets =
      selectedIds.length > 0
        ? queuedItems.filter((item) => selectedIds.includes(item.id))
        : queuedItems;
    if (targets.length === 0) {
      return null;
    }
    const assumed = targets.reduce((sum, item) => {
      const minutes = (item.durationMs ?? 60_000) / 60_000;
      return sum + minutes * 10 * 1024 * 1024;
    }, 0);
    return `目安 ${formatBytes(assumed)}（回線により変動）`;
  }, [queuedItems, selectedIds]);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl">Videos</h1>
        <button
          type="button"
          aria-expanded={queueOpen}
          onClick={() => setQueueOpen((value) => !value)}
          className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm hover:bg-paper-2"
        >
          ダウンロードキュー · {data.queuedCount} / {data.queueMax}
        </button>
      </div>
      <p className="mt-2 text-ink-2 text-sm">
        残したい動画だけを手元に保存し、ここで再生します。保存フォルダは{" "}
        <Link href="/settings" className="text-accent hover:underline">
          Settings
        </Link>{" "}
        で、表示中のアカウントごとに選びます。
      </p>

      <div className="mt-4 space-y-4">
        {supported === false ? (
          <p className="text-ink-2 text-sm">
            このブラウザではフォルダ保存に対応していません。Chrome / Edge
            で開いてください。通常ダウンロードは各動画の「ファイルを保存」からできます。
          </p>
        ) : null}

        {queueOpen ? (
          <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <h2 className="font-semibold">キュー</h2>
                {queuedItems.length > 0 ? (
                  <label className="flex items-center gap-1.5 text-ink-2 text-xs">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={
                        selectedIds.length > 0 &&
                        selectedIds.length === queuedItems.length
                      }
                      disabled={busy}
                      onChange={toggleSelectAll}
                    />
                    すべて
                  </label>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {busy ? (
                  <button
                    type="button"
                    disabled={stopping}
                    onClick={stopDownloads}
                    className="rounded-full border border-danger px-3 py-1.5 text-danger text-sm hover:bg-paper disabled:opacity-60"
                  >
                    {stopping ? "停止中…" : "停止"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!supported || !linked}
                    onClick={() => void cleanBrokenFiles()}
                    className="rounded-full border border-line px-3 py-1.5 text-ink-2 text-sm hover:bg-paper disabled:opacity-40"
                  >
                    途中ファイルを削除
                  </button>
                )}
                <button
                  type="button"
                  disabled={
                    busy ||
                    !supported ||
                    !linked ||
                    (selectedIds.length === 0 && resumableItems.length === 0)
                  }
                  onClick={() =>
                    void startDownloads(
                      selectedIds.length > 0 ? selectedIds : undefined,
                    )
                  }
                  className="rounded-full bg-ink px-3 py-1.5 text-paper text-sm disabled:opacity-50"
                >
                  {busy
                    ? "実行中…"
                    : selectedIds.length > 0
                      ? `選んだ ${selectedIds.length} 件を開始`
                      : "すべて開始"}
                </button>
              </div>
            </div>
            {eta ? <p className="mt-1 text-ink-2 text-xs">{eta}</p> : null}
            {supported && !linked ? (
              <p className="mt-2 text-ink-2 text-xs">
                {folderName ? (
                  <>
                    「{folderName}」を{" "}
                    <Link
                      href="/settings"
                      className="text-accent hover:underline"
                    >
                      Settings
                    </Link>{" "}
                    で再リンクすると開始できます。
                  </>
                ) : (
                  <>
                    <Link
                      href="/settings"
                      className="text-accent hover:underline"
                    >
                      Settings
                    </Link>{" "}
                    で保存フォルダを選ぶと開始できます。
                  </>
                )}
              </p>
            ) : null}
            {offlineHint ? (
              <p className="mt-2 text-warn text-xs">
                回線が切れました。つながったら「すべて開始」か各動画の「途中から再開」で続きから取り直せます。
              </p>
            ) : null}
            {data.queue.length === 0 ? (
              <p className="mt-3 text-ink-2 text-sm">
                キューは空です。原文の動画から「保存する」を押してください。
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.queue.map((item) => {
                  const prog = progress[item.id];
                  const received = prog?.received ?? 0;
                  const total = prog?.total ?? 0;
                  const pct = videoDownloadPercent(received, total);
                  const barPct = videoDownloadBarPercent(
                    received,
                    total,
                    item.estimatedBytes,
                  );
                  const byteLabel = videoDownloadByteLabel(
                    received,
                    total,
                    item.estimatedBytes,
                  );
                  // このタブで進捗のない downloading は、リースが生きていれば
                  // 別タブの実行中、切れていれば中断（別セッションの取り残し）
                  const otherTabActive =
                    item.status === "downloading" &&
                    !prog &&
                    !isVideoLeaseStale(item.lastProgressAt);
                  const interrupted =
                    item.status === "downloading" && !prog && !otherTabActive;
                  const downloading =
                    Boolean(prog) && item.status === "downloading";
                  const itemStopping = stopping && downloading;
                  const speedLabel =
                    downloading && !stopping
                      ? (formatDownloadSpeed(prog?.bps ?? null) ?? "計測中")
                      : null;
                  const statusLabel = itemStopping
                    ? "停止中"
                    : otherTabActive
                      ? "別のタブで実行中です"
                      : interrupted
                        ? "中断しています（再開できます）"
                        : item.status === "failed"
                          ? "失敗（途中から再開できます）"
                          : videoQueueStatusLabel(
                              downloading ? "downloading" : item.status,
                              pct,
                            );
                  const statusWithSpeed = speedLabel
                    ? `${statusLabel} · ${speedLabel}`
                    : statusLabel;
                  // ハートビートが残した停止位置（ADR-025）
                  const savedLabel =
                    item.progressBytes != null && item.progressBytes > 0
                      ? `${formatBytes(item.progressBytes)} まで保存済み`
                      : null;
                  const fileMeta = formatVideoQueueMeta({
                    bytes: item.bytes,
                    estimatedBytes: item.estimatedBytes,
                    qualityLabel: item.qualityLabel,
                    progressTotal: prog?.total,
                  });
                  return (
                    <li
                      key={item.id}
                      className="flex gap-3 rounded-xl border border-line bg-paper p-3"
                    >
                      {item.status === "queued" ? (
                        <label className="grid shrink-0 place-items-center self-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(item.id)}
                            disabled={busy}
                            aria-label={`${item.excerpt || item.tweetId}を選ぶ`}
                            onChange={() => toggleSelected(item.id)}
                          />
                        </label>
                      ) : (
                        <span className="w-4 shrink-0" aria-hidden />
                      )}
                      <div className="relative h-16 w-24 shrink-0">
                        <Image
                          src={item.previewSrc}
                          alt=""
                          width={96}
                          height={64}
                          unoptimized
                          className="h-16 w-24 rounded-lg object-cover"
                        />
                        <VideoThumbMarks
                          mediaType="video"
                          durationMs={item.durationMs}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          {item.authorUsername
                            ? `@${item.authorUsername} · `
                            : ""}
                          {item.excerpt || item.tweetId}
                        </p>
                        <p className="tabular-nums text-ink-2 text-xs">
                          {statusWithSpeed}
                          {savedLabel && !downloading
                            ? `（${savedLabel}）`
                            : ""}
                        </p>
                        {downloading ? (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div
                              className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-line"
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={barPct ?? undefined}
                              aria-label={[
                                byteLabel ??
                                  (pct != null
                                    ? `ダウンロード ${pct}%`
                                    : "ダウンロード中"),
                                speedLabel,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {barPct != null ? (
                                <div
                                  className="h-full bg-accent transition-[width] duration-150"
                                  style={{ width: `${barPct}%` }}
                                />
                              ) : (
                                <div className="h-full w-1/3 bg-accent motion-safe:animate-pulse" />
                              )}
                            </div>
                            <span className="shrink-0 text-right tabular-nums text-ink-2 text-xs">
                              <span className="block">
                                {byteLabel ??
                                  (pct != null ? `${pct}%` : "準備中")}
                              </span>
                              <span className="block">{speedLabel}</span>
                            </span>
                          </div>
                        ) : null}
                        {item.error ? (
                          <p className="mt-1 text-danger text-xs">
                            {item.error}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {fileMeta ? (
                            <span className="text-ink-2 text-xs">
                              {fileMeta}
                            </span>
                          ) : null}
                          {item.status === "failed" ? (
                            <>
                              <button
                                type="button"
                                disabled={busy || !supported || !linked}
                                className="text-accent text-xs hover:underline disabled:opacity-40"
                                onClick={() => void startDownloads([item.id])}
                              >
                                途中から再開
                              </button>
                              <button
                                type="button"
                                className="text-ink-2 text-xs hover:underline"
                                onClick={() => void cancelItem(item)}
                              >
                                取消
                              </button>
                            </>
                          ) : (
                            <>
                              {item.status === "queued" ? (
                                <button
                                  type="button"
                                  disabled={busy || !supported || !linked}
                                  className="text-accent text-xs hover:underline disabled:opacity-40"
                                  onClick={() => void startDownloads([item.id])}
                                >
                                  この動画だけ
                                </button>
                              ) : null}
                              {interrupted ? (
                                <button
                                  type="button"
                                  disabled={busy || !supported || !linked}
                                  className="text-accent text-xs hover:underline disabled:opacity-40"
                                  onClick={() => void startDownloads([item.id])}
                                >
                                  再開
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="text-ink-2 text-xs hover:underline"
                                onClick={() => void cancelItem(item)}
                              >
                                取消
                              </button>
                            </>
                          )}
                          {!supported ? (
                            <a
                              href={mediaVideoRedirectPath(item.mediaId)}
                              download
                              rel="noreferrer"
                              className="text-accent text-xs hover:underline"
                            >
                              ファイルを保存
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        ) : null}

        <section>
          <div className="flex flex-wrap items-center gap-2">
            <Chip
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label={`すべて · ${data.library.length}`}
            />
            <Chip
              active={filter === "none"}
              onClick={() => setFilter("none")}
              label="未分類"
            />
            {data.folders.map((folder) => (
              <Chip
                key={folder.id}
                active={filter === folder.id}
                onClick={() => setFilter(folder.id)}
                label={folder.name}
                onRemove={() => void removeFolder(folder)}
              />
            ))}
            <button
              type="button"
              onClick={() => void createFolder()}
              className="rounded-full border border-line px-3 py-1 text-xs hover:bg-paper-2"
            >
              ＋新規フォルダ
            </button>
          </div>
          {visible.length === 0 ? (
            <p className="mt-6 text-center text-ink-2 text-sm">
              保存した動画はまだありません。
            </p>
          ) : (
            <ul className="mt-4 grid grid-cols-2 gap-3 min-[48rem]:grid-cols-3">
              {visible.map((item) => (
                <li
                  key={item.id}
                  className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper-2"
                >
                  <button
                    type="button"
                    className="relative block w-full"
                    onClick={() => void playItem(item)}
                  >
                    <Image
                      src={item.previewSrc}
                      alt=""
                      width={480}
                      height={270}
                      unoptimized
                      className="h-28 w-full object-cover"
                    />
                    {item.durationMs != null ? (
                      <span className="absolute right-1 bottom-1 rounded bg-ink/80 px-1 text-[10px] text-paper">
                        {formatDuration(item.durationMs).label}
                      </span>
                    ) : null}
                  </button>
                  <div className="p-2">
                    <p className="line-clamp-2 text-xs">
                      {item.authorUsername ? `@${item.authorUsername} ` : ""}
                      {item.excerpt}
                    </p>
                    <p className="mt-1 text-[10px] text-ink-2">
                      {[
                        item.downloadedAt?.slice(0, 10),
                        item.bytes ? formatBytes(item.bytes) : null,
                        item.qualityLabel,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <VideoCardMenu
                      item={item}
                      folders={data.folders}
                      onMove={(folderId) => void moveItem(item, folderId)}
                      onDelete={() => void removeItem(item)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {message ? <p className="text-ink-2 text-xs">{message}</p> : null}

        {playing ? (
          <VideoPlayer
            url={playing.url}
            title={
              playing.item.authorUsername
                ? `@${playing.item.authorUsername} ${playing.item.excerpt}`
                : playing.item.excerpt
            }
            folderLabel={playing.item.folderName ?? "未分類"}
            index={Math.max(0, playlistIndex(playlist, playing.item.id))}
            total={playlist.length}
            repeat={repeat}
            onRepeatChange={changeRepeat}
            onClose={closePlayer}
            onPrev={() => stepPlaying(-1)}
            onNext={() => stepPlaying(1)}
            onEnded={() => {
              if (repeat === "folder") {
                stepPlaying(1);
              }
            }}
          />
        ) : null}
      </div>
    </>
  );
}

function Chip({
  label,
  active,
  onClick,
  onRemove,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  onRemove?: () => void;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
        active ? "border-ink bg-paper-2 font-semibold" : "border-line"
      }`}
    >
      <button type="button" onClick={onClick}>
        {label}
      </button>
      {onRemove ? (
        <button
          type="button"
          aria-label={`${label}を削除`}
          onClick={onRemove}
          className="text-ink-2"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

function VideoCardMenu({
  item,
  folders,
  onMove,
  onDelete,
}: {
  item: VideoItem;
  folders: VideoFolder[];
  onMove: (folderId: string | null) => void;
  onDelete: () => void;
}) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  return (
    <div className="mt-2 flex items-end justify-between gap-2 text-[11px]">
      <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
        {item.sourceId ? (
          <Link
            href={`/source/${item.sourceId}`}
            className="text-accent hover:underline"
          >
            Source
          </Link>
        ) : null}
        {item.postUrl ? (
          <a
            href={item.postUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            X
          </a>
        ) : null}
        <label className="text-ink-2">
          <select
            aria-label="フォルダ"
            className="max-w-28 bg-transparent"
            value={item.folderId ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onMove(value.length > 0 ? value : null);
            }}
          >
            <option value="">未分類</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        ref={rootRef}
        className="relative notranslate shrink-0"
        lang="ja"
        translate="no"
      >
        <button
          type="button"
          aria-label="操作"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            setCoords({
              top: rect.bottom + 4,
              right: window.innerWidth - rect.right,
            });
            setOpen((value) => !value);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full text-ink-2 hover:bg-paper"
        >
          <span aria-hidden className="text-base leading-none">
            ⋮
          </span>
        </button>
        {open && coords ? (
          <div
            id={panelId}
            role="menu"
            className="fixed z-50 min-w-36 rounded-xl border border-line bg-paper/95 py-1 shadow-card backdrop-blur"
            style={{ top: coords.top, right: coords.right }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="block w-full px-3 py-2 text-left text-danger text-sm hover:bg-paper-2"
            >
              削除
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
