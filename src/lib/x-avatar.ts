const SIZE_RE =
  /_(normal|bigger|mini|reasonably_small|200x200|400x400)(\.[a-z0-9]+)$/i;

export function xAvatarDisplayUrl(
  url: string,
  size: "normal" | "bigger" | "200x200" = "bigger",
): string {
  if (!SIZE_RE.test(url)) {
    return url;
  }
  return url.replace(SIZE_RE, `_${size}$2`);
}

export function authorInitial(
  authorName: string | null | undefined,
  authorUsername: string | null | undefined,
): string {
  const raw = (authorName ?? authorUsername ?? "?").trim();
  const text = raw.startsWith("@") ? raw.slice(1) : raw;
  return (text || "?").slice(0, 1);
}
