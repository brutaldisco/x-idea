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
  const img = html.match(
    /<img\b[^>]*\b(?:src|data-src)\s*=\s*["']([^"']+)["']/i,
  );
  const fromImg = absoluteHttpUrl(img?.[1] ?? null, base);
  if (fromImg) {
    return fromImg;
  }
  const srcset = html.match(/<img\b[^>]*\bsrcset\s*=\s*["']([^"']+)["']/i);
  const firstSrc = srcset?.[1]?.split(",")[0]?.trim().split(/\s+/)[0];
  const fromSrcset = absoluteHttpUrl(firstSrc ?? null, base);
  if (fromSrcset) {
    return fromSrcset;
  }
  for (const match of html.matchAll(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi,
  )) {
    const href = match[1] ?? "";
    if (!isLikelyImageHref(href, base)) {
      continue;
    }
    const url = absoluteHttpUrl(href, base);
    if (url) {
      return url;
    }
  }
  return null;
}

function isLikelyImageHref(raw: string, base: string): boolean {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(
      `${url.pathname}${url.search}`,
    );
  } catch {
    return false;
  }
}

/** 空の `thumbnail_url` はページ再取得を省略する印。本文画像は使う。 */
export function resolveStoredThumbnail(input: {
  thumbnailUrl: string | null;
  contentHtml: string | null;
  baseUrl: string;
}): string | null {
  return (
    absoluteHttpUrl(input.thumbnailUrl, input.baseUrl) ??
    firstContentImage(input.contentHtml, input.baseUrl)
  );
}

export const MEDIA_PHOTO_FIRST_SQL =
  "CASE WHEN m.type = 'photo' THEN 0 ELSE 1 END, m.created_at ASC";
