import sanitizeHtml from "sanitize-html";

const IMAGE_EXT = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:$|\?)/i;

function httpUrl(raw: string | null | undefined, base: string): string | null {
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
export const HTML_REFRESH_MARK = "<!-- x-idea:html-refresh -->";
export const NO_COVER_MARK = "<!-- x-idea:no-cover -->";

export function isLikelyImageUrl(
  raw: string | null | undefined,
  base: string,
): boolean {
  const url = httpUrl(raw, base);
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return IMAGE_EXT.test(`${parsed.pathname}${parsed.search}`);
  } catch {
    return false;
  }
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

export function imgParagraphs(urls: readonly string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = raw.trim();
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    out.push(`<p><img src="${escapeHtmlAttr(url)}" alt=""></p>`);
    if (out.length >= 8) {
      break;
    }
  }
  return out.join("");
}

export function restoreStrippedImages(html: string, base: string): string {
  if (!html) {
    return html;
  }
  return html.replace(
    /<a\b([^>]*?)\bhref\s*=\s*(["'])([^"']+)\2([^>]*)>(\s*)<\/a>/gi,
    (full, _pre: string, _quote: string, href: string) => {
      if (!isLikelyImageUrl(href, base)) {
        return full;
      }
      const src = httpUrl(href, base) ?? href;
      return `<img src="${escapeHtmlAttr(src)}" alt="">`;
    },
  );
}

export function sanitizeArticleHtml(html: string, base: string): string {
  const cleaned = sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img"],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "width", "height"],
    },
  });
  return restoreStrippedImages(cleaned, base);
}

export function withHtmlMark(html: string, mark: string): string {
  if (html.includes(mark)) {
    return html;
  }
  return `${html}${mark}`;
}

export function withoutHtmlMark(html: string, mark: string): string {
  return html.replaceAll(mark, "");
}
