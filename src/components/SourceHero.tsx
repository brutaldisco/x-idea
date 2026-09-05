import Image from "next/image";
import { OpenInX } from "@/components/OpenInX";
import { sourceTransitionStyle } from "@/lib/view-transition";
import type { MediaItem } from "@/server/sources/detail";

export function SourceHero({
  sourceId,
  authorName,
  authorUsername,
  authorAvatarUrl,
  postedAt,
  url,
  media,
}: {
  sourceId: string;
  authorName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  postedAt: string | null;
  url: string;
  media: MediaItem[];
}) {
  const when = postedAt
    ? new Date(postedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
    : null;
  const hero = media[0] ?? null;
  const heroSrc =
    hero?.type === "photo" ? hero.src : (hero?.previewSrc ?? hero?.src ?? null);

  return (
    <header className="mt-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {authorAvatarUrl ? (
            // Remote X avatars are not in next/image remotePatterns.
            // biome-ignore lint/performance/noImgElement: external avatar URL
            <img
              src={authorAvatarUrl}
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-paper-2 text-ink-2 text-sm">
              {(authorName ?? authorUsername ?? "?").slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">
              {authorName ?? ""}{" "}
              {authorUsername ? (
                <span className="text-ink-2">@{authorUsername}</span>
              ) : null}
            </p>
            {when ? (
              <p
                className="notranslate text-ink-2 text-xs"
                lang="ja"
                translate="no"
              >
                {when}
              </p>
            ) : null}
          </div>
        </div>
        <span className="notranslate shrink-0" lang="ja" translate="no">
          <OpenInX url={url} />
        </span>
      </div>
      {heroSrc ? (
        <div
          className="relative mt-4 overflow-hidden rounded-[var(--radius-card)] bg-paper-2"
          style={sourceTransitionStyle(sourceId)}
        >
          <Image
            src={heroSrc}
            alt={hero?.altText ?? ""}
            width={hero?.width ?? 1200}
            height={hero?.height ?? 800}
            unoptimized
            className="max-h-80 w-full object-cover"
          />
          {hero && hero.type !== "photo" ? (
            <span className="absolute right-2 bottom-2 rounded bg-ink/80 px-2 py-0.5 text-paper text-xs">
              動画
            </span>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
