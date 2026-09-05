import Image from "next/image";
import Link from "next/link";
import { SourceCardMenu } from "@/components/SourceCardMenu";
import { translatableProps } from "@/lib/chrome-translate";
import { formatCardDate } from "@/lib/datetime";

function thumbSrc(mediaId: string, mediaType: string | null): string {
  return mediaType === "photo"
    ? `/api/media/${mediaId}`
    : `/api/media/${mediaId}?preview=1`;
}

export function SourceCard({
  id,
  authorUsername,
  summary,
  url,
  mediaId,
  mediaType,
  lang,
  summaryFromAi = false,
  postedAt,
  variant = "list",
}: {
  id: string;
  authorUsername: string | null;
  summary: string;
  url: string | null;
  mediaId?: string | null;
  mediaType?: string | null;
  lang?: string | null;
  summaryFromAi?: boolean;
  postedAt?: string | null;
  variant?: "list" | "rail";
}) {
  const textAttrs = translatableProps(lang, summaryFromAi);
  const dateLabel = formatCardDate(postedAt);
  const rail = variant === "rail";

  return (
    <li
      className={
        rail
          ? "w-56 shrink-0 rounded-[var(--radius-card)] border border-line bg-paper-2 p-3"
          : "rounded-[var(--radius-card)] border border-line bg-paper-2 p-4"
      }
    >
      {mediaId && rail ? (
        <Link href={`/source/${id}`} className="relative mb-2 block">
          <Image
            src={thumbSrc(mediaId, mediaType ?? null)}
            alt=""
            width={448}
            height={224}
            unoptimized
            className="h-28 w-full rounded-lg object-cover"
          />
          {mediaType && mediaType !== "photo" ? (
            <span className="absolute right-1 bottom-1 rounded bg-ink/80 px-1 text-[10px] text-paper">
              動画
            </span>
          ) : null}
        </Link>
      ) : null}
      <div className={rail ? "" : "flex gap-3"}>
        {mediaId && !rail ? (
          <Link
            href={`/source/${id}`}
            className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-paper"
          >
            <Image
              src={thumbSrc(mediaId, mediaType ?? null)}
              alt=""
              width={160}
              height={160}
              unoptimized
              className="h-full w-full object-cover"
            />
            {mediaType && mediaType !== "photo" ? (
              <span className="absolute right-1 bottom-1 rounded bg-ink/80 px-1 text-[10px] text-paper">
                動画
              </span>
            ) : null}
          </Link>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {authorUsername ? (
                <p className="truncate text-ink-2 text-xs">@{authorUsername}</p>
              ) : null}
              {dateLabel ? (
                <p
                  className="notranslate text-ink-2 text-xs tabular-nums"
                  lang="ja"
                  translate="no"
                >
                  {dateLabel}
                </p>
              ) : null}
            </div>
            <SourceCardMenu sourceId={id} url={url} />
          </div>
          <Link
            href={`/source/${id}`}
            className={`mt-1 block text-sm hover:underline ${rail ? "line-clamp-4" : ""}`}
            {...textAttrs}
          >
            {summary}
          </Link>
        </div>
      </div>
    </li>
  );
}
