"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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

function stopVideo(video: HTMLVideoElement): void {
  video.pause();
  try {
    video.currentTime = 0;
  } catch {
    // ignore seek errors on unloaded media
  }
}

function MediaVideo({
  src,
  poster,
  onError,
}: {
  src: string;
  poster: string;
  onError: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) {
      return;
    }

    const pause = () => {
      if (!video.paused) {
        video.pause();
      }
    };
    const leavePage = () => {
      stopVideo(video);
    };
    const onVisibility = () => {
      if (document.hidden) {
        leavePage();
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => !entry.isIntersecting)) {
          pause();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(video);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leavePage);

    return () => {
      leavePage();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leavePage);
    };
  }, []);

  return (
    <video
      ref={ref}
      controls
      playsInline
      preload="metadata"
      poster={poster}
      src={src}
      className="max-h-[32rem] w-full bg-ink"
      onError={onError}
    >
      <track kind="captions" />
    </video>
  );
}

function MediaTile({ item, onOpen }: { item: MediaItem; onOpen: () => void }) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const pending =
    item.downloadStatus === "pending" || item.downloadStatus === "downloading";
  const confirm = item.downloadStatus === "awaiting_confirm";
  const failed = item.downloadStatus === "failed";
  const showVideo = item.type !== "photo" && !videoFailed;
  const showImage = item.type === "photo" && !imageFailed;

  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-paper">
      {item.type === "photo" ? (
        showImage ? (
          <button type="button" onClick={onOpen} className="block w-full">
            <Image
              src={item.src}
              alt={item.altText ?? "画像"}
              width={item.width ?? 1200}
              height={item.height ?? 800}
              unoptimized
              className="max-h-[32rem] w-full object-contain"
              onError={() => {
                setImageFailed(true);
              }}
            />
          </button>
        ) : (
          <div className="flex min-h-40 items-center justify-center bg-paper-2 px-3 py-6 text-center text-ink-2 text-sm">
            画像を読み込めませんでした。X で開いて確認してください。
          </div>
        )
      ) : showVideo ? (
        <MediaVideo
          src={item.src}
          poster={item.previewSrc}
          onError={() => {
            setVideoFailed(true);
          }}
        />
      ) : (
        <Image
          src={item.previewSrc}
          alt={item.altText ?? "動画プレビュー"}
          width={item.width ?? 1200}
          height={item.height ?? 800}
          unoptimized
          className="max-h-[32rem] w-full object-contain"
        />
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
        <p className="px-3 py-2 text-ink-2 text-xs">
          ローカル保存中…（表示はこのままできます）
        </p>
      ) : null}
      {failed ? (
        <p className="px-3 py-2 text-danger text-xs">
          保存に失敗しました。取得した画像・動画で表示しています。
          {item.downloadError ? `（${item.downloadError}）` : ""}
        </p>
      ) : null}
      {videoFailed ? (
        <p className="px-3 py-2 text-ink-2 text-xs">
          動画を再生できません。プレビューを表示しています。
        </p>
      ) : null}
    </figure>
  );
}
