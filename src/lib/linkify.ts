export type TextPart = {
  text: string;
  href?: string;
  offset: number;
};

const URL_RE = /https?:\/\/[^\s<>"'）)】]+/gi;
const TRAILING_PUNCT = /[.,;:!?。、]+$/u;

export function sanitizeHttpUrl(raw: string): string | null {
  const cleaned = raw.replace(TRAILING_PUNCT, "");
  if (!cleaned) {
    return null;
  }
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return cleaned;
  } catch {
    return null;
  }
}

export function splitHttpUrls(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const re = new RegExp(URL_RE.source, "gi");
  let last = 0;
  let match = re.exec(text);
  while (match) {
    const raw = match[0];
    const start = match.index;
    if (start > last) {
      parts.push({ text: text.slice(last, start), offset: last });
    }
    const href = sanitizeHttpUrl(raw);
    if (href) {
      const trailing = raw.slice(href.length);
      parts.push({ text: href, href, offset: start });
      if (trailing) {
        parts.push({ text: trailing, offset: start + href.length });
      }
    } else {
      parts.push({ text: raw, offset: start });
    }
    last = start + raw.length;
    match = re.exec(text);
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last), offset: last });
  }
  return parts.length > 0 ? parts : [{ text, offset: 0 }];
}
