"use client";

import Image from "next/image";
import { useState } from "react";
import type { MediaItem } from "@/server/sources/detail";

function confirmDownload(id: string, action: "start" | "skip") {
  return fetch(`/api/media/${id}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

export function MediaGallery({ items }: { items: MediaItem[] }) {
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

function MediaTile({ item, onOpen }: { item: MediaItem; onOpen: () => void }) {
  const pending =
    item.downloadStatus === "pending" || item.downloadStatus === "downloading";
  const confirm = item.downloadStatus === "awaiting_confirm";
  const failed = item.downloadStatus === "failed";

  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-paper">
      {item.type === "photo" ? (
        <button type="button" onClick={onOpen} className="block w-full">
          <Image
            src={item.src}
            alt={item.altText ?? "画像"}
            width={item.width ?? 1200}
            height={item.height ?? 800}
            unoptimized
            className="max-h-[32rem] w-full object-contain"
          />
        </button>
      ) : (
        <video
          controls
          preload="metadata"
          poster={item.previewUrl ?? undefined}
          src={item.src}
          className="max-h-[32rem] w-full bg-ink"
        >
          <track kind="captions" />
        </video>
      )}
      {item.altText ? (
        <figcaption className="px-3 py-2 text-ink-2 text-xs">
          {item.altText}
        </figcaption>
      ) : null}
      {confirm ? (
        <div className="space-y-2 border-line border-t px-3 py-3 text-sm">
          <p>
            長時間の動画（約 {item.durationLabel}）です。ダウンロードしますか？
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-full bg-ink px-3 py-1 text-paper text-xs"
              onClick={() => {
                void confirmDownload(item.id, "start").then(() => {
                  window.location.reload();
                });
              }}
            >
              ダウンロード
            </button>
            <button
              type="button"
              className="rounded-full border border-line px-3 py-1 text-xs"
              onClick={() => {
                void confirmDownload(item.id, "skip").then(() => {
                  window.location.reload();
                });
              }}
            >
              しない
            </button>
          </div>
        </div>
      ) : null}
      {pending ? (
        <p className="px-3 py-2 text-ink-2 text-xs">ローカル保存中…</p>
      ) : null}
      {failed ? (
        <p className="px-3 py-2 text-danger text-xs">
          保存に失敗しました。X の画像で表示しています。
          {item.downloadError ? `（${item.downloadError}）` : ""}
        </p>
      ) : null}
    </figure>
  );
}
