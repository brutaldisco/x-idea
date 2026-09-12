"use client";

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
import { initialVideoDownloadPlan } from "@/lib/video-download-plan";
import { useVideoSaveFolder } from "@/lib/video-folder";
import {
  folderPlaylist,
  playlistIndex,
  type RepeatMode,
  stepPlaylist,
} from "@/lib/video-playlist";
import {
  videoDownloadBarPercent,
  videoDownloadByteLabel,
  videoDownloadPercent,
  videoQueueStatusLabel,
} from "@/lib/video-progress";
import { isResumableVideoQueueStatus } from "@/lib/video-queue";
import {
  clearProgress,
  downloadVideoFile,
  ensureWritePermission,
  loadVideoRoot,
  moveVideoFile,
  openVideoObjectUrl,
  removeSavedVideoFiles,
  suggestedRelPath,
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

/** 中断した項目を queued に戻す（オフライン等で失敗しても次回開始時に拾う） */
async function requeueItem(id: string): Promise<void> {
  try {
    await fetch(`/api/videos/queue/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "requeue" }),
    });
  } catch {
    // best effort
  }
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
  const { supported, linked, folderName } = useVideoSaveFolder(
    accountId,
    initialFolderName,
  );
  const [data, setData] = useState(initial);
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [progress, setProgress] = useState<
    Record<string, { received: number; total: number }>
  >({});
  const [playing, setPlaying] = useState<{
    item: VideoItem;
    url: string;
  } | null>(null);
  const [repeat, setRepeat] = useState<RepeatMode>("folder");
  const abortRef = useRef<AbortController | null>(null);
  const activeRef = useRef<Set<string>>(new Set());
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
    const onOffline = () => {
      abortRef.current?.abort();
      setOfflineHint(true);
      setBusy(false);
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
    // queued に加えて、このタブで動いていない downloading（中断分）も拾う
    const resumable = data.queue.filter((item) =>
      isResumableVideoQueueStatus(item.status, activeRef.current.has(item.id)),
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
    setMessage(null);
    setOfflineHint(false);
    const controller = new AbortController();
    abortRef.current = controller;
    const started = performance.now();
    let doneBytes = 0;
    let doneCount = 0;
    let failCount = 0;
    const maxEstimated = Math.max(
      0,
      ...chosen.map((item) => item.estimatedBytes ?? 0),
    );
    const parallel = initialVideoDownloadPlan(
      maxEstimated > 0 ? maxEstimated : null,
    ).parallel;
    let cursor = 0;

    const runItem = async (item: (typeof chosen)[number]) => {
      activeRef.current.add(item.id);
      const relPath = suggestedRelPath(item);
      try {
        await fetch(`/api/videos/queue/${item.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        });
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
        setProgress((prev) => ({
          ...prev,
          [item.id]: { received: 0, total: 0 },
        }));
        const result = await downloadVideoFile({
          downloadId: item.id,
          mediaId: item.mediaId,
          relPath,
          root: handle,
          estimatedBytes: item.estimatedBytes,
          signal: controller.signal,
          onProgress: (received, total) => {
            setProgress((prev) => ({
              ...prev,
              [item.id]: { received, total },
            }));
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
        setProgress((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
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
          await requeueItem(item.id);
          setProgress((prev) => {
            const next = { ...prev };
            delete next[item.id];
            return next;
          });
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
        setData((prev) => ({
          ...prev,
          queue: prev.queue.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "failed", error: messageText }
              : entry,
          ),
        }));
      } finally {
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
      if (doneBytes > 0 && elapsed > 0) {
        parts.push(
          `実測 ${(doneBytes / elapsed / 1024 / 1024).toFixed(1)} MB/s`,
        );
      }
      if (parts.length > 0) {
        setMessage(parts.join("。"));
      }
      await refresh();
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stopDownloads() {
    abortRef.current?.abort();
  }

  async function cancelItem(id: string) {
    await fetch(`/api/videos/queue/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    await refresh();
  }

  async function retryItem(id: string) {
    await fetch(`/api/videos/queue/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry" }),
    });
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
      const url = await openVideoObjectUrl(handle, item.relPath);
      setPlaying((current) => {
        if (current) {
          URL.revokeObjectURL(current.url);
        }
        return { item, url };
      });
    } catch {
      setMessage("ファイルが見つかりません。再ダウンロードできます。");
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

  // 開始対象: queued + このタブで動いていない downloading（中断分）
  const resumableItems = useMemo(
    () =>
      data.queue.filter((item) =>
        isResumableVideoQueueStatus(
          item.status,
          activeRef.current.has(item.id),
        ),
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
                    onClick={stopDownloads}
                    className="rounded-full border border-danger px-3 py-1.5 text-danger text-sm hover:bg-paper"
                  >
                    停止
                  </button>
                ) : null}
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
                回線が切れました。つながったら「すべて開始」か選んだ件で再開できます。
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
                  // このタブで進捗のない downloading は中断（別セッションの取り残し）
                  const interrupted = item.status === "downloading" && !prog;
                  const downloading = Boolean(prog);
                  const statusLabel = interrupted
                    ? "中断しています（再開できます）"
                    : videoQueueStatusLabel(
                        downloading && item.status !== "failed"
                          ? "downloading"
                          : item.status,
                        pct,
                      );
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
                        <p className="text-ink-2 text-xs">{statusLabel}</p>
                        {downloading ? (
                          <div className="mt-1.5 flex items-center gap-2">
                            <div
                              className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-line"
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={barPct ?? undefined}
                              aria-label={
                                byteLabel ??
                                (pct != null
                                  ? `ダウンロード ${pct}%`
                                  : "ダウンロード中")
                              }
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
                            <span className="shrink-0 tabular-nums text-ink-2 text-xs">
                              {byteLabel ??
                                (pct != null ? `${pct}%` : "準備中")}
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
                            <button
                              type="button"
                              className="text-accent text-xs hover:underline"
                              onClick={() => void retryItem(item.id)}
                            >
                              再試行
                            </button>
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
                                onClick={() => void cancelItem(item.id)}
                              >
                                取消
                              </button>
                            </>
                          )}
                          {!supported ? (
                            <a
                              href={`/api/media/${item.mediaId}/file`}
                              download
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
