import { ChromeTranslate } from "@/components/ChromeTranslate";
import { MediaGallery } from "@/components/MediaGallery";
import { OpenInX } from "@/components/OpenInX";
import { translatableProps } from "@/lib/chrome-translate";
import type { PostCard } from "@/server/sources/detail";

export function PostBlock({
  post,
  eyebrow,
}: {
  post: PostCard;
  eyebrow?: string;
}) {
  const when = post.postedAt
    ? new Date(post.postedAt).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
      })
    : null;
  const textId = `post-text-${post.id}`;
  const attrs = translatableProps(post.lang, false);
  const quote = post.quotedSnapshot?.text?.trim() ?? "";
  const translateSource = quote ? `${post.text}\n\n${quote}` : post.text;
  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-5">
      {eyebrow ? (
        <p className="notranslate text-ink-2 text-xs" lang="ja" translate="no">
          {eyebrow}
        </p>
      ) : null}
      <div className="mt-1 flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">
            {post.authorName ?? ""}{" "}
            {post.authorUsername ? (
              <span className="text-ink-2">@{post.authorUsername}</span>
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
        <span className="notranslate" lang="ja" translate="no">
          <OpenInX url={post.url} />
        </span>
      </div>
      <p
        id={textId}
        className="mt-3 whitespace-pre-wrap text-[1.05rem] leading-7"
        {...attrs}
      >
        {post.text}
      </p>
      {quote ? (
        <blockquote
          className="mt-3 rounded-xl border border-line bg-paper px-3 py-2 text-ink-2 text-sm"
          {...attrs}
        >
          {quote}
        </blockquote>
      ) : null}
      <ChromeTranslate
        text={translateSource}
        lang={post.lang}
        targetId={textId}
      />
      <MediaGallery items={post.media} />
    </article>
  );
}
