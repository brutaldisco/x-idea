import Link from "next/link";
import { sourceTransitionStyle } from "@/lib/view-transition";
import { authorInitial, xAvatarDisplayUrl } from "@/lib/x-avatar";

const AVATAR_CLASS = {
  sm: "h-10 w-10 text-sm",
  md: "h-12 w-12 text-base",
  lg: "h-20 w-20 text-xl",
} as const;

const AVATAR_SIZE = {
  sm: "bigger",
  md: "bigger",
  lg: "200x200",
} as const;

export function SourceThumbFallback({
  sourceId,
  href,
  authorAvatarUrl,
  authorName,
  authorUsername,
  className,
  avatarSize = "md",
  shareTransition = true,
}: {
  sourceId: string;
  href?: string;
  authorAvatarUrl?: string | null;
  authorName?: string | null;
  authorUsername?: string | null;
  className: string;
  avatarSize?: keyof typeof AVATAR_CLASS;
  shareTransition?: boolean;
}) {
  const initial = authorInitial(authorName, authorUsername);
  const src = authorAvatarUrl
    ? xAvatarDisplayUrl(authorAvatarUrl, AVATAR_SIZE[avatarSize])
    : null;
  const inner = src ? (
    // Remote X avatars are not in next/image remotePatterns.
    // biome-ignore lint/performance/noImgElement: external avatar URL
    <img
      src={src}
      alt=""
      width={avatarSize === "lg" ? 80 : 48}
      height={avatarSize === "lg" ? 80 : 48}
      className={`${AVATAR_CLASS[avatarSize]} rounded-full object-cover`}
    />
  ) : (
    <span
      className={`flex items-center justify-center rounded-full bg-paper-2 text-ink-2 ${AVATAR_CLASS[avatarSize]}`}
    >
      {initial}
    </span>
  );
  const wrapClass = `flex items-center justify-center ${className}`;
  const style = shareTransition ? sourceTransitionStyle(sourceId) : undefined;
  if (href) {
    return (
      <Link
        href={href}
        transitionTypes={["nav-forward"]}
        className={wrapClass}
        style={style}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className={wrapClass} style={style}>
      {inner}
    </div>
  );
}
