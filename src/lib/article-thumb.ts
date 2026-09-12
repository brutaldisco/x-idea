export const ARTICLE_THUMB_KEY_PREFIX = "article-og:";

export function articleThumbMediaKey(articleId: string): string {
  return `${ARTICLE_THUMB_KEY_PREFIX}${articleId}`;
}

export function isArticleThumbMediaKey(
  mediaKey: string | null | undefined,
): boolean {
  return Boolean(mediaKey?.startsWith(ARTICLE_THUMB_KEY_PREFIX));
}

export function absoluteHttpUrl(
  raw: string | null | undefined,
  base: string,
): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function firstContentImage(
  html: string | null | undefined,
  base: string,
): string | null {
  if (!html) {
    return null;
  }
  const match = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return absoluteHttpUrl(match?.[1] ?? null, base);
}

/** `thumbnail_url === ""` は「探して無かった」印。再取得しない。 */
export function resolveStoredThumbnail(input: {
  thumbnailUrl: string | null;
  contentHtml: string | null;
  baseUrl: string;
}): string | null {
  if (input.thumbnailUrl === "") {
    return null;
  }
  return (
    absoluteHttpUrl(input.thumbnailUrl, input.baseUrl) ??
    firstContentImage(input.contentHtml, input.baseUrl)
  );
}

export const MEDIA_PHOTO_FIRST_SQL =
  "CASE WHEN m.type = 'photo' THEN 0 ELSE 1 END, m.created_at ASC";
