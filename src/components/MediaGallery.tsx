"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { MediaItem } from "@/server/sources/detail";

export function MediaGallery({
  items,
  postUrl,
}: {
  items: MediaItem[];
  postUrl?: string | null;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-1 gap-3 min-[48rem]:grid-cols-2">
        {items.map((item) => (
          <MediaTile
            key={item.id}
            item={item}
            postUrl={postUrl ?? null}
            onOpen={() => {
              if (item.type === "photo") {
                setLightbox(item.src);
              }
            }}
          />
        ))}
      </div>
      {lightbox ? (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-8"
          onClick={() => setLightbox(null)}
        >
          <Image
            src={lightbox}
            alt=""
            width={1600}
            height={1200}
            unoptimized
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </button>
      ) : null}
    </div>
  );
}

function MediaTile({
  item,
  postUrl,
  onOpen,
}: {
  item: MediaItem;
  postUrl: string | null;
  onOpen: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const pending =
    item.downloadStatus === "pending" || item.downloadStatus === "downloading";
  const failed = item.downloadStatus === "failed";
  const showImage = !imageFailed;
  const isVideo = item.type !== "photo";

  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-paper">
      {showImage ? (
        <button
          type="button"
          onClick={() => {
            if (isVideo) {
              return;
            }
            onOpen();
          }}
          className="relative block w-full"
          aria-label={isVideo ? "動画は X で見る" : "画像を拡大"}
        >
          <Image
            src={isVideo ? item.previewSrc : item.src}
            alt={item.altText ?? (isVideo ? "動画プレビュー" : "画像")}
            width={item.width ?? 1200}
            height={item.height ?? 800}
            unoptimized
            className="max-h-[32rem] w-full object-contain"
            onError={() => {
              setImageFailed(true);
            }}
          />
          {isVideo ? (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink/70 text-paper text-xl">
                ▶
              </span>
            </span>
          ) : null}
        </button>
      ) : (
        <div className="flex min-h-40 items-center justify-center bg-paper-2 px-3 py-6 text-center text-ink-2 text-sm">
          読み込めませんでした。X で開いて確認してください。
        </div>
      )}
      {item.altText ? (
        <figcaption className="px-3 py-2 text-ink-2 text-xs">
          {item.altText}
        </figcaption>
      ) : null}
      {isVideo ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-line border-t px-3 py-2">
          {postUrl ? (
            <a
              href={postUrl}
              target="_blank"
              rel="noreferrer"
              className="notranslate shrink-0 rounded-full bg-ink px-3 py-1 text-paper text-xs"
              lang="ja"
              translate="no"
            >
              X で見る
            </a>
          ) : (
            <span className="text-ink-2 text-xs">動画は X で見ます。</span>
          )}
          <VideoSaveControl item={item} />
        </div>
      ) : null}
      {pending && !isVideo ? (
        <p className="px-3 py-2 text-ink-2 text-xs">
          画像を保存しています…（表示はこのままできます）
        </p>
      ) : null}
      {failed && !isVideo ? (
        <p className="px-3 py-2 text-danger text-xs">
          保存に失敗しました。取得した画像で表示しています。
          {item.downloadError ? `（${item.downloadError}）` : ""}
        </p>
      ) : null}
    </figure>
  );
}

function VideoSaveControl({ item }: { item: MediaItem }) {
  const [status, setStatus] = useState(item.videoSaveStatus);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (status === "ready") {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="rounded-full bg-ok/15 px-2 py-0.5 text-ok">
          保存済み
        </span>
        <Link href="/videos" className="text-accent hover:underline">
          Videos で開く
        </Link>
      </span>
    );
  }
  if (status === "queued" || status === "downloading") {
    return (
      <Link href="/videos" className="text-accent text-xs hover:underline">
        キューに追加済み
      </Link>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMessage(null);
          void fetch("/api/videos/queue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ media_id: item.id }),
          })
            .then(async (res) => {
              const body = (await res.json().catch(() => null)) as {
                error?: { message?: string };
              } | null;
              if (!res.ok) {
                throw new Error(body?.error?.message ?? "追加できませんでした");
              }
              setStatus("queued");
              setMessage("キューに追加しました（Videos タブで実行）");
            })
            .catch((error: unknown) => {
              setMessage(
                error instanceof Error ? error.message : "追加できませんでした",
              );
            })
            .finally(() => setBusy(false));
        }}
        className="rounded-full border border-line px-3 py-1 text-xs hover:bg-paper-2 disabled:opacity-50"
      >
        {busy ? "追加中…" : "あとで保存"}
      </button>
      {message ? (
        <span className="text-ink-2 text-[11px]">{message}</span>
      ) : null}
    </span>
  );
}
