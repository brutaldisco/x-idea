import Link from "next/link";
import { LinkedText } from "@/components/LinkedText";
import { SourceCardMenu } from "@/components/SourceCardMenu";
import { SourceCardThumb } from "@/components/SourceCardThumb";
import { VideoBadge } from "@/components/VideoBadge";
import { translatableProps } from "@/lib/chrome-translate";
import { formatCardDate } from "@/lib/datetime";
import { taxonomyAccentClass } from "@/lib/taxonomy-accent";
import {
  type TaxonomyChip,
  type TaxonomyChipItem,
  taxonomyChip,
} from "@/lib/taxonomy-chip";
import { canShowSaveVideosMenu } from "@/lib/video-queue";

function thumbSrc(mediaId: string, mediaType: string | null): string {
  return mediaType === "photo"
    ? `/api/media/${mediaId}`
    : `/api/media/${mediaId}?preview=1`;
}

function ThumbPlaceholder({ className }: { className: string }) {
  return <span className={`block bg-paper ${className}`} aria-hidden />;
}

function MiniTaxonomyBadge({ chip }: { chip: TaxonomyChip }) {
  const accent = taxonomyAccentClass(chip.color);
  return (
    <span
      title={chip.name}
      className={`min-w-0 overflow-hidden whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
        accent || "bg-paper text-ink-2"
      }`}
    >
      {chip.name}
    </span>
  );
}

export function SourceCard({
  id,
  categoryId,
  infoType,
  categories = [],
  infoTypes = [],
  summary,
  url,
  mediaId,
  mediaType,
  videoSaveStatus,
  videoRelPath,
  kind,
  hasQueueableVideos,
  lang,
  summaryFromAi = false,
  postedAt,
  variant = "list",
}: {
  id: string;
  categoryId?: string | null;
  infoType?: string | null;
  categories?: TaxonomyChipItem[];
  infoTypes?: TaxonomyChipItem[];
  summary: string;
  url: string | null;
  mediaId?: string | null;
  mediaType?: string | null;
  videoSaveStatus?: string | null;
  videoRelPath?: string | null;
  kind?: string | null;
  hasQueueableVideos?: boolean;
  lang?: string | null;
  summaryFromAi?: boolean;
  postedAt?: string | null;
  variant?: "list" | "rail" | "grid";
}) {
  const textAttrs = translatableProps(lang, summaryFromAi);
  const dateLabel = formatCardDate(postedAt);
  const stacked = variant === "rail" || variant === "grid";
  const category = taxonomyChip(categoryId, categories);
  const typeChip = taxonomyChip(infoType, infoTypes, "info_type");

  return (
    <li
      data-source-id={id}
      className={
        variant === "rail"
          ? "w-56 shrink-0 rounded-[var(--radius-card)] border border-line bg-paper-2 p-3"
          : variant === "grid"
            ? "min-w-0 w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper-2 p-2"
            : "min-w-0 w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper-2 p-4"
      }
    >
      {stacked ? (
        mediaId ? (
          <SourceCardThumb
            sourceId={id}
            href={`/source/${id}`}
            title={summary}
            thumbUrl={thumbSrc(mediaId, mediaType ?? null)}
            imageWidth={448}
            imageHeight={224}
            wrapperClassName={
              variant === "grid"
                ? "relative mb-1.5 block w-full"
                : "relative mb-2 block w-full"
            }
            imageClassName={`${variant === "grid" ? "h-[112px]" : "h-28"} w-full rounded-lg object-cover`}
            mediaId={mediaId}
            mediaType={mediaType}
            videoSaveStatus={videoSaveStatus}
            videoRelPath={videoRelPath}
          >
            {mediaType && mediaType !== "photo" ? (
              <VideoBadge saveStatus={videoSaveStatus} />
            ) : null}
          </SourceCardThumb>
        ) : (
          <Link
            href={`/source/${id}`}
            transitionTypes={["nav-forward"]}
            className={
              variant === "grid"
                ? "relative mb-1.5 block w-full"
                : "relative mb-2 block w-full"
            }
          >
            <ThumbPlaceholder
              className={`${variant === "grid" ? "h-[112px]" : "h-28"} w-full rounded-lg`}
            />
          </Link>
        )
      ) : null}
      <div className={stacked ? "min-w-0" : "flex min-w-0 gap-3"}>
        {!stacked ? (
          mediaId ? (
            <SourceCardThumb
              sourceId={id}
              href={`/source/${id}`}
              title={summary}
              thumbUrl={thumbSrc(mediaId, mediaType ?? null)}
              imageWidth={160}
              imageHeight={160}
              wrapperClassName="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-paper"
              imageClassName="h-full w-full object-cover"
              mediaId={mediaId}
              mediaType={mediaType}
              videoSaveStatus={videoSaveStatus}
              videoRelPath={videoRelPath}
            >
              {mediaType && mediaType !== "photo" ? (
                <VideoBadge saveStatus={videoSaveStatus} />
              ) : null}
            </SourceCardThumb>
          ) : (
            <Link
              href={`/source/${id}`}
              transitionTypes={["nav-forward"]}
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-paper"
            >
              <ThumbPlaceholder className="h-full w-full" />
            </Link>
          )
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 leading-none">
            {dateLabel ? (
              <p
                className="notranslate shrink-0 text-ink-2 text-xs tabular-nums"
                lang="ja"
                translate="no"
              >
                {dateLabel}
              </p>
            ) : null}
            {category || typeChip ? (
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                {category ? <MiniTaxonomyBadge chip={category} /> : null}
                {typeChip ? <MiniTaxonomyBadge chip={typeChip} /> : null}
              </div>
            ) : null}
            <div className="ml-auto shrink-0">
              <SourceCardMenu
                sourceId={id}
                url={url}
                compact={variant === "grid"}
                canQueueVideos={canShowSaveVideosMenu({
                  kind,
                  hasQueueableVideos,
                })}
              />
            </div>
          </div>
          <div
            className={`mt-1 break-words text-sm ${
              variant === "grid"
                ? "line-clamp-3"
                : stacked
                  ? "line-clamp-4"
                  : ""
            }`}
            {...textAttrs}
          >
            <LinkedText
              text={summary}
              renderPlain={(chunk) => (
                <Link
                  href={`/source/${id}`}
                  transitionTypes={["nav-forward"]}
                  className="hover:underline"
                >
                  {chunk}
                </Link>
              )}
            />
          </div>
        </div>
      </div>
    </li>
  );
}
