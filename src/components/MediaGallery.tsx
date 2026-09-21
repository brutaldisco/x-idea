"use client";

import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { QueueBadge } from "@/components/QueueBadge";
import { SavedBadge } from "@/components/SavedBadge";
import { SavedVideoThumbButton } from "@/components/SavedVideoThumbButton";
import { VideoThumbImg } from "@/components/VideoThumbImg";
import { VideoThumbMarks } from "@/components/VideoThumbMarks";
import { useLiveMediaVideoSave } from "@/lib/use-video-save-status";
import { applyVideoSaveStatus } from "@/lib/video-save-status";
import { formatVideoQueueMeta } from "@/server/media/select";
import type { MediaItem } from "@/server/sources/detail";

export function MediaGallery({
  items,
  postUrl,
  sourceId,
}: {
  items: MediaItem[];
  postUrl?: string | null;
  sourceId?: string | null;
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
            sourceId={sourceId ?? null}
            onOpen={() => {
              if (item.type === "photo") {
                setLightbox(item.src);
              }
            }}
          />
        ))}
      </div>
      {lightbox ? (
        <PhotoLightbox src={lightbox} onClose={() => setLightbox(null)} />
      ) : null}
    </div>
  );
}

function MediaTile({
  item,
  postUrl,
  sourceId,
  onOpen,
}: {
  item: MediaItem;
  postUrl: string | null;
  sourceId: string | null;
  onOpen: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const live = useLiveMediaVideoSave(item.id, {
    videoSaveStatus: item.videoSaveStatus,
    videoRelPath: item.videoRelPath,
  });
  const pending =
    item.downloadStatus === "pending" || item.downloadStatus === "downloading";
  const failed = item.downloadStatus === "failed";
  const showImage = !imageFailed;
  const isVideo = item.type !== "photo";
  const playable = isVideo && live.videoSaveStatus === "ready";
  const fileMeta = isVideo
    ? formatVideoQueueMeta({
        bytes: item.bytes,
        estimatedBytes: item.estimatedBytes,
        qualityLabel: item.qualityLabel,
      })
    : null;
  const preview = (
    <>
      {isVideo ? (
        <VideoThumbImg
          relPath={live.videoRelPath}
          src={item.previewSrc}
          alt={item.altText ?? "動画プレビュー"}
          width={item.width ?? 1200}
          height={item.height ?? 800}
          className="max-h-[32rem] w-full object-contain"
          onError={() => {
            setImageFailed(true);
          }}
        />
      ) : (
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
      )}
      {playable ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink/70 text-paper text-xl">
            ▶
          </span>
        </span>
      ) : null}
      <VideoThumbMarks
        mediaType={item.type}
        saveStatus={live.videoSaveStatus}
        durationMs={item.durationMs}
        className="right-1.5 bottom-1.5"
      />
    </>
  );

  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-paper">
      {showImage ? (
        playable ? (
          <SavedVideoThumbButton
            mediaId={item.id}
            videoRelPath={live.videoRelPath}
            title={item.altText ?? "動画"}
            className="relative block w-full"
          >
            {preview}
          </SavedVideoThumbButton>
        ) : isVideo && postUrl ? (
          <a
            href={postUrl}
            target="_blank"
            rel="noreferrer"
            className="relative block w-full"
            aria-label="X で見る"
          >
            {preview}
          </a>
        ) : (
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
            {preview}
          </button>
        )
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
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {fileMeta ? (
              <span className="text-ink-2 text-xs">{fileMeta}</span>
            ) : null}
            {!postUrl ? (
              <span className="text-ink-2 text-xs">動画は X で見ます。</span>
            ) : null}
          </div>
          <VideoSaveControl
            item={item}
            sourceId={sourceId}
            status={live.videoSaveStatus}
          />
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

function VideoSaveControl({
  item,
  sourceId,
  status,
}: {
  item: MediaItem;
  sourceId: string | null;
  status: string | null;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (status === "ready") {
    return (
      <span className="flex items-center gap-2 text-xs">
        <SavedBadge compact={false} />
        <Link href="/videos" className="text-accent hover:underline">
          Videos で開く
        </Link>
      </span>
    );
  }
  if (status === "queued" || status === "downloading") {
    return (
      <span className="flex items-center gap-2 text-xs">
        <QueueBadge compact={false} />
        <Link href="/videos" className="text-accent hover:underline">
          Videos で開く
        </Link>
      </span>
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
              applyVideoSaveStatus(queryClient, {
                sourceId,
                mediaId: item.id,
                videoSaveStatus: "queued",
              });
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
        {busy ? "追加中…" : "保存する"}
      </button>
      {message ? (
        <span className="text-ink-2 text-[11px]">{message}</span>
      ) : null}
    </span>
  );
}
