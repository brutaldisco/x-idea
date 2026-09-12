import { ChromeTranslate } from "@/components/ChromeTranslate";
import { ReaderBody } from "@/components/ReaderBody";
import { translatableProps } from "@/lib/chrome-translate";
import { scopeLabel } from "@/server/fetch/classify";

const LONG_ARTICLE = 400;

export function ArticleBlock({
  id,
  title,
  url,
  scope,
  description,
  contentText,
  contentHtml,
}: {
  id: string;
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
  const bodyId = `article-text-${id}`;
  const translateText = [title?.trim(), text].filter(Boolean).join("\n\n");
  const long = translateText.length >= LONG_ARTICLE;
  const attrs = translatableProps(null, false);
  const translate =
    fetched && translateText ? (
      <ChromeTranslate
        text={translateText.slice(0, 12_000)}
        lang={null}
        targetId={bodyId}
        className={long ? "mb-3" : "mt-3"}
      />
    ) : null;

  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-3 min-[48rem]:px-8 min-[48rem]:py-8">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 font-medium text-sm">{heading}</h3>
        <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-ink-2 text-xs">
          {scopeLabel(scope)}
        </span>
      </div>
      {long ? translate : null}
      {html && fetched ? (
        <div
          id={bodyId}
          className="article-body reader-body mt-3"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: saved after sanitize-html
          dangerouslySetInnerHTML={{ __html: html }}
          {...attrs}
        />
      ) : text ? (
        <ReaderBody
          id={bodyId}
          className="reader-body mt-3"
          text={text.length > 12_000 ? `${text.slice(0, 12_000)}…` : text}
          {...attrs}
        />
      ) : scope === "pending" ? (
        <p className="mt-3 text-ink-2 text-xs">記事を取得しています…</p>
      ) : (
        <p className="mt-3 text-ink-2 text-xs">
          本文は取得できませんでした。元のページを開いて確認できます。
        </p>
      )}
      {long ? null : translate}
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
