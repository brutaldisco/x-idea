import { MediaGallery } from "@/components/MediaGallery";
import { OpenInX } from "@/components/OpenInX";
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
  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-5">
      {eyebrow ? <p className="text-ink-2 text-xs">{eyebrow}</p> : null}
      <div className="mt-1 flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm">
            {post.authorName ?? ""}{" "}
            {post.authorUsername ? (
              <span className="text-ink-2">@{post.authorUsername}</span>
            ) : null}
          </p>
          {when ? <p className="text-ink-2 text-xs">{when}</p> : null}
        </div>
        <OpenInX url={post.url} />
      </div>
      <p className="mt-3 whitespace-pre-wrap text-[1.05rem] leading-7">
        {post.text}
      </p>
      {post.quotedSnapshot?.text ? (
        <blockquote className="mt-3 rounded-xl border border-line bg-paper px-3 py-2 text-ink-2 text-sm">
          {post.quotedSnapshot.text}
        </blockquote>
      ) : null}
      <MediaGallery items={post.media} />
    </article>
  );
}
