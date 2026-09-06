"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadRepeatMode,
  saveRepeatMode,
  VideoPlayer,
} from "@/components/videos/VideoPlayer";
import { formatBytes } from "@/lib/bytes";
import { useVideoSaveFolder } from "@/lib/video-folder";
import {
  folderPlaylist,
  playlistIndex,
  type RepeatMode,
  stepPlaylist,
} from "@/lib/video-playlist";
import {
  deleteVideoFile,
  downloadVideoFile,
  ensureWritePermission,
  loadVideoRoot,
  moveVideoFile,
  openVideoObjectUrl,
  suggestedRelPath,
} from "@/lib/video-store";
import { formatDuration } from "@/server/media/select";
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

export function VideosWorkspace({
  initial,
  initialFolderName,
}: {
  initial: VideoLibraryPayload;
  initialFolderName?: string | null;
}) {
  const router = useRouter();
  const { supported, linked, folderName } =
    useVideoSaveFolder(initialFolderName);
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
  const [offlineHint, setOfflineHint] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    setData(initial);
  }, [initial]);

  useEffect(() => {
    setRepeat(loadRepeatMode());
  }, []);

  useEffect(() => {
    void loadVideoRoot().then((handle) => {
      if (handle) {
        setRoot(handle);
      }
    });
  }, []);

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

  async function refresh() {
    const res = await fetch("/api/videos/queue", { cache: "no-store" });
    if (res.ok) {
      setData((await res.json()) as VideoLibraryPayload);
    }
    router.refresh();
  }

  async function startDownloads() {
    const handle = root ?? (await loadVideoRoot());
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
    const queued = data.queue.filter((item) => item.status === "queued");
    if (queued.length === 0) {
      setMessage("キューは空です");
      return;
    }
    setBusy(true);
    setMessage(null);
    setOfflineHint(false);
    const controller = new AbortController();
    abortRef.current = controller;
    const started = performance.now();
    let doneBytes = 0;
    try {
      for (const item of queued) {
        if (controller.signal.aborted) {
          break;
        }
        const relPath = suggestedRelPath(item);
        await fetch(`/api/videos/queue/${item.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        });
        try {
          const result = await downloadVideoFile({
            downloadId: item.id,
            mediaId: item.mediaId,
            relPath,
            root: handle,
            signal: controller.signal,
            onProgress: (received, total) => {
              setProgress((prev) => ({
                ...prev,
                [item.id]: { received, total },
              }));
            },
          });
          doneBytes += result.bytes;
          await fetch(`/api/videos/queue/${item.id}/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rel_path: result.relPath,
              bytes: result.bytes,
            }),
          });
        } catch (error) {
          if ((error as { name?: string }).name === "AbortError") {
            break;
          }
          await fetch(`/api/videos/queue/${item.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "fail",
              error: errorMessage(error),
            }),
          });
        }
      }
      const elapsed = (performance.now() - started) / 1000;
      if (doneBytes > 0 && elapsed > 0) {
        setMessage(
          `完了。実測 ${(doneBytes / elapsed / 1024 / 1024).toFixed(1)} MB/s`,
        );
      }
      await refresh();
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
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
    const handle = root ?? (await loadVideoRoot());
    if (handle) {
      setRoot(handle);
    }
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
        "ライブラリから削除しますか？アプリの記録は消えます。保存フォルダのファイルは、このブラウザから削除を試みます。残った場合は Finder で消してください。",
      )
    ) {
      return;
    }
    const handle = root ?? (await loadVideoRoot());
    if (handle) {
      setRoot(handle);
    }
    if (handle && item.relPath) {
      try {
        await deleteVideoFile(handle, item.relPath);
      } catch {
        // leftover files are expected
      }
    }
    await fetch(`/api/videos/${item.id}`, { method: "DELETE" });
    await refresh();
  }

  async function playItem(item: VideoItem) {
    const handle = root ?? (await loadVideoRoot());
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

  const eta = useMemo(() => {
    const queued = data.queue.filter((item) => item.status === "queued");
    if (queued.length === 0) {
      return null;
    }
    const assumed = queued.reduce((sum, item) => {
      const minutes = (item.durationMs ?? 60_000) / 60_000;
      return sum + minutes * 10 * 1024 * 1024;
    }, 0);
    return `目安 ${formatBytes(assumed)}（回線により変動）`;
  }, [data.queue]);

  return (
    <>
      <p className="text-ink-2 text-sm">Videos</p>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-semibold text-2xl">動画</h1>
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
        で選びます。
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
              <h2 className="font-semibold">キュー</h2>
              <button
                type="button"
                disabled={busy || !supported || !linked}
                onClick={() => void startDownloads()}
                className="rounded-full bg-ink px-3 py-1.5 text-paper text-sm disabled:opacity-50"
              >
                {busy ? "実行中…" : "ダウンロード開始"}
              </button>
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
                回線が切れました。つながったら「ダウンロード開始」で再開できます。
              </p>
            ) : null}
            {data.queue.length === 0 ? (
              <p className="mt-3 text-ink-2 text-sm">
                キューは空です。原文の動画から「あとで保存」を押してください。
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.queue.map((item) => {
                  const prog = progress[item.id];
                  const pct =
                    prog && prog.total > 0
                      ? Math.min(
                          100,
                          Math.round((prog.received / prog.total) * 100),
                        )
                      : null;
                  return (
                    <li
                      key={item.id}
                      className="flex gap-3 rounded-xl border border-line bg-paper p-3"
                    >
                      <Image
                        src={item.previewSrc}
                        alt=""
                        width={96}
                        height={64}
                        unoptimized
                        className="h-16 w-24 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          {item.authorUsername
                            ? `@${item.authorUsername} · `
                            : ""}
                          {item.excerpt || item.tweetId}
                        </p>
                        <p className="text-ink-2 text-xs">{item.status}</p>
                        {pct != null ? (
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-2">
                            <div
                              className="h-full bg-accent"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        ) : null}
                        {item.error ? (
                          <p className="mt-1 text-danger text-xs">
                            {item.error}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.status === "failed" ? (
                            <button
                              type="button"
                              className="text-accent text-xs hover:underline"
                              onClick={() => void retryItem(item.id)}
                            >
                              再試行
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="text-ink-2 text-xs hover:underline"
                              onClick={() => void cancelItem(item.id)}
                            >
                              取消
                            </button>
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
                      {item.downloadedAt?.slice(0, 10) ?? ""}
                      {item.bytes ? ` · ${formatBytes(item.bytes)}` : ""}
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
  return (
    <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px]">
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
      <button type="button" className="text-danger" onClick={onDelete}>
        削除
      </button>
    </div>
  );
}
