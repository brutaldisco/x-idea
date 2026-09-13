export type ReaderLine = {
  text: string;
  /** 正規化後テキスト上の開始位置。React key 用 */
  offset: number;
  /** 直前に空行があった。大きめの間を開ける */
  breakBefore: boolean;
  /** 箇条書き・番号付きの行。前後を詰める */
  bullet: boolean;
};

const BULLET_RE = /^\s*(?:[-*・･●○◆▶▼>»]|\(?\d{1,2}[.)）]|[①-⑳])\s/u;
const SENTENCE_RE = /[^。．！？!?]+[。．！？!?]+/gu;
/** この字数以上の行は、改行が無くても句点で段落に分ける */
const LONG_LINE_CHARS = 80;
const ABBREV_DOT = "\uE000";
const ABBREV_RE =
  /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|Inc|Ltd|Fig|approx|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\./gi;
const LATIN_ABBREV_RE = /\b(?:e\.g|i\.e|U\.S|U\.K|U\.N)\./gi;

export function splitReaderLines(text: string): ReaderLine[] {
  const raw = text.replace(/\r\n?/g, "\n").split("\n");
  const lines: ReaderLine[] = [];
  let pendingBreak = false;
  let offset = 0;
  for (const row of raw) {
    if (row.trim().length === 0) {
      if (lines.length > 0) {
        pendingBreak = true;
      }
    } else {
      const next = row.trimEnd();
      lines.push({
        text: next,
        offset,
        breakBefore: pendingBreak,
        bullet: BULLET_RE.test(next),
      });
      pendingBreak = false;
    }
    offset += row.length + 1;
  }
  return lines;
}

/** 先頭は 0。空行のあと 1.8em、箇条書きの連続 0.2em、それ以外 0.8em */
export function readerLineGapEm(
  current: ReaderLine,
  previous: ReaderLine | undefined,
): number {
  if (!previous) {
    return 0;
  }
  if (current.breakBefore) {
    return 1.8;
  }
  if (current.bullet && previous.bullet) {
    return 0.2;
  }
  return 0.8;
}

function firstNonSpaceOffset(text: string, start: number): number {
  const slice = text.slice(start);
  const found = slice.search(/\S/u);
  return found < 0 ? start : start + found;
}

function toLine(text: string, offset: number): ReaderLine {
  const next = text.trim();
  return {
    text: next,
    offset,
    breakBefore: false,
    bullet: BULLET_RE.test(next),
  };
}

function protectLatinNoise(text: string): string {
  return text
    .replace(/\bhttps?:\/\/[^\s<]+/gi, (match) =>
      match.replaceAll(".", ABBREV_DOT),
    )
    .replace(/\b(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g, (match) =>
      match.replaceAll(".", ABBREV_DOT),
    )
    .replace(/\b\d+\.\d+/g, (match) => match.replaceAll(".", ABBREV_DOT))
    .replace(ABBREV_RE, (match) => match.replaceAll(".", ABBREV_DOT))
    .replace(LATIN_ABBREV_RE, (match) => match.replaceAll(".", ABBREV_DOT));
}

/** 英文の `.!?` + 空白 + 大文字を文境界にする */
export function splitEnglishSentences(text: string): string[] {
  const protectedText = protectLatinNoise(text);
  return protectedText
    .split(/(?<=[.!?])["”’']?\s+(?=[A-Z“"‘'])/)
    .map((part) => part.replaceAll(ABBREV_DOT, ".").trim())
    .filter(Boolean);
}

function splitJaSentences(text: string): ReaderLine[] {
  const lines: ReaderLine[] = [];
  const re = new RegExp(SENTENCE_RE.source, "gu");
  let last = 0;
  let match = re.exec(text);
  while (match) {
    if (match.index > last) {
      const lead = text.slice(last, match.index);
      if (lead.trim()) {
        lines.push(toLine(lead, firstNonSpaceOffset(text, last)));
      }
    }
    const raw = match[0];
    if (raw.trim()) {
      lines.push(toLine(raw, firstNonSpaceOffset(text, match.index)));
    }
    last = match.index + raw.length;
    match = re.exec(text);
  }
  const tail = text.slice(last);
  if (tail.trim()) {
    lines.push(toLine(tail, firstNonSpaceOffset(text, last)));
  }
  return lines;
}

/** 改行が消えた本文を、和文の句点と英文のピリオドで段落にする */
export function splitReaderSentences(text: string): ReaderLine[] {
  const lines: ReaderLine[] = [];
  let cursor = 0;
  for (const ja of splitJaSentences(text)) {
    const pieces =
      [...ja.text].length >= LONG_LINE_CHARS || /[.!?]\s+[A-Z]/.test(ja.text)
        ? splitEnglishSentences(ja.text)
        : [ja.text];
    for (const piece of pieces) {
      const found = text.indexOf(piece, cursor);
      const offset = found >= 0 ? found : ja.offset;
      lines.push(toLine(piece, offset));
      cursor = offset + piece.length;
    }
  }
  return lines;
}

/**
 * 改行があれば行で分ける。長い一行（翻訳結果など）は句点でも分ける。
 * 空行の区切りは、句点分割した先頭の文だけが引き継ぐ。
 */
export function splitReadableLines(text: string): ReaderLine[] {
  const lines = splitReaderLines(text);
  const out: ReaderLine[] = [];
  for (const line of lines) {
    const pieces =
      [...line.text].length >= LONG_LINE_CHARS ||
      /[.!?]\s+[A-Z]/.test(line.text)
        ? splitReaderSentences(line.text)
        : [line];
    for (const [index, piece] of pieces.entries()) {
      out.push({
        text: piece.text,
        offset: line.offset + (index === 0 ? 0 : piece.offset + 1),
        breakBefore: index === 0 ? line.breakBefore : false,
        bullet: piece.bullet,
      });
    }
  }
  return out;
}

function decodeHtmlText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeHtmlText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function withoutStyleAttr(attrs: string): string {
  return attrs.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, "");
}

/**
 * 記事 HTML のプレーンな `<p>` を、原文と同じ段落ルールで組み直す。
 * リンク・画像・見出しがある段落は触らない。DB は書き換えない。
 */
export function reflowArticleHtml(html: string): string {
  if (!html.includes("<p")) {
    return html;
  }
  return html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (full, attrs, inner) => {
    if (/<(?!br\s*\/?)[a-z]/i.test(inner)) {
      return full;
    }
    const text = decodeHtmlText(String(inner));
    const lines = splitReadableLines(text);
    if (lines.length <= 1) {
      return full;
    }
    return lines
      .map((line, index) => {
        const previous = index > 0 ? lines[index - 1] : undefined;
        const gap = readerLineGapEm(line, previous);
        const style =
          gap > 0
            ? ` style="margin-top:${gap}em;margin-bottom:0"`
            : ' style="margin-top:0;margin-bottom:0"';
        return `<p${withoutStyleAttr(String(attrs))}${style}>${escapeHtmlText(line.text)}</p>`;
      })
      .join("");
  });
}

/** Translator が改行を残しやすいように、行のあいだを空行にして渡す */
export function packReaderLinesForTranslate(text: string): string {
  const lines = splitReaderLines(text);
  if (lines.length <= 1) {
    return text;
  }
  return lines
    .map((line, index) => {
      if (index === 0) {
        return line.text;
      }
      return line.breakBefore ? `\n\n\n${line.text}` : `\n\n${line.text}`;
    })
    .join("");
}
