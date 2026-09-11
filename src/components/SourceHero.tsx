import Image from "next/image";
import { ExpandablePhoto } from "@/components/PhotoLightbox";
import { SavedVideoThumbButton } from "@/components/SavedVideoThumbButton";
import { SourceMetaFields } from "@/components/SourceMetaFields";
import { VideoBadge } from "@/components/VideoBadge";
import type { TaxonomyAccentId } from "@/lib/taxonomy-accent";
import { sourceTransitionStyle } from "@/lib/view-transition";
import type { MediaItem } from "@/server/sources/detail";

export function SourceHero({
  sourceId,
  authorName,
  authorUsername,
  authorAvatarUrl,
  postedAt,
  media,
  categoryId,
  categoryName,
  infoType,
  readStatus,
  kind,
  categories,
  infoTypes,
}: {
  sourceId: string;
  authorName: string | null;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
  postedAt: string | null;
  media: MediaItem[];
  categoryId: string | null;
  categoryName: string | null;
  infoType: string | null;
  readStatus: string;
  kind: string;
  categories: {
    id: string;
    name: string;
    color?: TaxonomyAccentId | null;
  }[];
  infoTypes: {
    id: string;
    name: string;
    color?: TaxonomyAccentId | null;
  }[];
}) {
  const when = postedAt
    ? new Date(postedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
    : null;
  const hero = media[0] ?? null;
  const heroSrc =
    hero?.type === "photo" ? hero.src : (hero?.previewSrc ?? hero?.src ?? null);

  return (
    <header className="mt-5">
      <div className="flex flex-col gap-3 min-[40rem]:flex-row min-[40rem]:items-start min-[40rem]:justify-between">
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
        <SourceMetaFields
          id={sourceId}
          categoryId={categoryId}
          categoryName={categoryName}
          infoType={infoType}
          readStatus={readStatus}
          kind={kind}
          categories={categories}
          infoTypes={infoTypes}
        />
      </div>
      {heroSrc ? (
        hero && hero.type !== "photo" && hero.videoSaveStatus === "ready" ? (
          <SavedVideoThumbButton
            mediaId={hero.id}
            videoRelPath={hero.videoRelPath}
            title={hero.altText ?? "動画"}
            className="relative mt-4 block w-full overflow-hidden rounded-[var(--radius-card)] bg-paper-2"
          >
            <Image
              src={heroSrc}
              alt={hero.altText ?? ""}
              width={hero.width ?? 1200}
              height={hero.height ?? 800}
              unoptimized
              className="max-h-80 w-full object-cover"
            />
            <VideoBadge
              saveStatus={hero.videoSaveStatus}
              compact={false}
              className="right-3 bottom-3"
            />
          </SavedVideoThumbButton>
        ) : hero?.type === "photo" ? (
          <ExpandablePhoto
            src={heroSrc}
            alt={hero.altText ?? ""}
            width={hero.width ?? 1200}
            height={hero.height ?? 800}
            className="max-h-80 w-full object-cover"
            wrapperClassName="relative mt-4 block w-full overflow-hidden rounded-[var(--radius-card)] bg-paper-2"
            style={sourceTransitionStyle(sourceId)}
          />
        ) : (
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
            <VideoBadge
              saveStatus={hero.videoSaveStatus}
              compact={false}
              className="right-3 bottom-3"
            />
          </div>
        )
      ) : null}
    </header>
  );
}
