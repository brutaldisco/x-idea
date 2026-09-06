import { ChromeTranslate } from "@/components/ChromeTranslate";
import { LinkedText } from "@/components/LinkedText";
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
  lang,
}: {
  id: string;
  title: string | null;
  url: string;
  scope: string;
  description: string | null;
  contentText: string | null;
  contentHtml?: string | null;
  lang?: string | null;
}) {
  const html = contentHtml?.trim() ?? "";
  const text = contentText?.trim() || description?.trim() || "";
  const heading = title?.trim() || url;
  const fetched = scope === "full" || scope === "partial";
  const bodyId = `article-text-${id}`;
  const translateText = [title?.trim(), text].filter(Boolean).join("\n\n");
  const long = translateText.length >= LONG_ARTICLE;
  const attrs = translatableProps(lang, false);
  const translate =
    fetched && translateText ? (
      <ChromeTranslate
        text={translateText.slice(0, 12_000)}
        lang={lang ?? null}
        targetId={bodyId}
        className={long ? "mb-3" : "mt-3"}
      />
    ) : null;

  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
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
          className="article-body mt-3 text-sm leading-7 [&_a]:text-accent [&_a]:underline [&_h1]:mt-4 [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:font-semibold [&_img]:my-3 [&_img]:max-w-full [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: saved after sanitize-html
          dangerouslySetInnerHTML={{ __html: html }}
          {...attrs}
        />
      ) : text ? (
        <p
          id={bodyId}
          className="mt-3 whitespace-pre-wrap text-sm leading-7"
          {...attrs}
        >
          <LinkedText
            text={text.length > 12_000 ? `${text.slice(0, 12_000)}…` : text}
          />
        </p>
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
