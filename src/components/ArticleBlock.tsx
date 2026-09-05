import { scopeLabel } from "@/server/fetch/classify";

export function ArticleBlock({
  title,
  url,
  scope,
  description,
  contentText,
}: {
  title: string | null;
  url: string;
  scope: string;
  description: string | null;
  contentText: string | null;
}) {
  const body = contentText?.trim() || description;
  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-accent text-sm hover:underline"
        >
          {title || url}
        </a>
        <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-ink-2 text-xs">
          {scopeLabel(scope)}
        </span>
      </div>
      {body ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
          {body.length > 4000 ? `${body.slice(0, 4000)}…` : body}
        </p>
      ) : scope === "pending" ? (
        <p className="mt-2 text-ink-2 text-xs">記事を取得しています…</p>
      ) : null}
    </article>
  );
}
