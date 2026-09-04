import Link from "next/link";
import { OpenInX } from "@/components/OpenInX";

export function SourceCard({
  id,
  authorUsername,
  summary,
  url,
}: {
  id: string;
  authorUsername: string | null;
  summary: string;
  url: string | null;
}) {
  return (
    <li className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
      <div className="flex items-start justify-between gap-3">
        {authorUsername ? (
          <p className="text-ink-2 text-xs">@{authorUsername}</p>
        ) : (
          <span />
        )}
        {url ? <OpenInX url={url} compact /> : null}
      </div>
      <Link
        href={`/source/${id}`}
        className="mt-1 block text-sm hover:underline"
      >
        {summary}
      </Link>
    </li>
  );
}
