import { scopeLabel } from "@/server/fetch/classify";

export function ArticleBlock({
  title,
  url,
  scope,
  description,
  contentText,
  contentHtml,
}: {
  title: string | null;
  url: string;
  scope: string;
  description: string | null;
  contentText: string | null;
  contentHtml?: string | null;
}) {
  const html = contentHtml?.trim() ?? "";
  const text = contentText?.trim() || description?.trim() || "";
  const heading = title?.trim() || url;
  const fetched = scope === "full" || scope === "partial";

  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 font-medium text-sm">{heading}</h3>
        <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-ink-2 text-xs">
          {scopeLabel(scope)}
        </span>
      </div>
      {html && fetched ? (
        <div
          className="article-body mt-3 text-sm leading-7 [&_a]:text-accent [&_a]:underline [&_h1]:mt-4 [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:font-semibold [&_img]:my-3 [&_img]:max-w-full [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: saved after sanitize-html
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : text ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
          {text.length > 12_000 ? `${text.slice(0, 12_000)}…` : text}
        </p>
      ) : scope === "pending" ? (
        <p className="mt-3 text-ink-2 text-xs">記事を取得しています…</p>
      ) : (
        <p className="mt-3 text-ink-2 text-xs">
          本文は取得できませんでした。元のページを開いて確認できます。
        </p>
      )}
      <p className="notranslate mt-3" lang="ja" translate="no">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-accent text-xs hover:underline"
        >
          元の記事を開く
        </a>
      </p>
    </article>
  );
}
