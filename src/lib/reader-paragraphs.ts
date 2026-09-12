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

/** Chrome 翻訳のように改行が消えた本文を、句点単位の段落にする */
export function splitReaderSentences(text: string): ReaderLine[] {
  const lines: ReaderLine[] = [];
  const re = new RegExp(SENTENCE_RE.source, "gu");
  let last = 0;
  let match = re.exec(text);
  while (match) {
    if (match.index > last) {
      const lead = text.slice(last, match.index);
      if (lead.trim()) {
        const offset = firstNonSpaceOffset(text, last);
        const next = lead.trim();
        lines.push({
          text: next,
          offset,
          breakBefore: false,
          bullet: BULLET_RE.test(next),
        });
      }
    }
    const raw = match[0];
    const next = raw.trim();
    if (next) {
      lines.push({
        text: next,
        offset: firstNonSpaceOffset(text, match.index),
        breakBefore: false,
        bullet: BULLET_RE.test(next),
      });
    }
    last = match.index + raw.length;
    match = re.exec(text);
  }
  const tail = text.slice(last);
  if (tail.trim()) {
    const next = tail.trim();
    lines.push({
      text: next,
      offset: firstNonSpaceOffset(text, last),
      breakBefore: false,
      bullet: BULLET_RE.test(next),
    });
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
      [...line.text].length >= LONG_LINE_CHARS
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
