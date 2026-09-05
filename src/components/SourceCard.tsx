import Image from "next/image";
import Link from "next/link";
import { OpenInX } from "@/components/OpenInX";
import { translatableProps } from "@/lib/chrome-translate";

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
}: {
  id: string;
  authorUsername: string | null;
  summary: string;
  url: string | null;
  mediaId?: string | null;
  mediaType?: string | null;
  lang?: string | null;
  summaryFromAi?: boolean;
}) {
  const textAttrs = translatableProps(lang, summaryFromAi);
  return (
    <li className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
      <div className="flex gap-3">
        {mediaId ? (
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
          <div className="flex items-start justify-between gap-3">
            {authorUsername ? (
              <p className="text-ink-2 text-xs">@{authorUsername}</p>
            ) : (
              <span />
            )}
            {url ? (
              <span className="notranslate" lang="ja" translate="no">
                <OpenInX url={url} compact />
              </span>
            ) : null}
          </div>
          <Link
            href={`/source/${id}`}
            className="mt-1 block text-sm hover:underline"
            {...textAttrs}
          >
            {summary}
          </Link>
        </div>
      </div>
    </li>
  );
}
