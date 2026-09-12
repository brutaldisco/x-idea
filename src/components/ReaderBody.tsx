import type { HTMLAttributes } from "react";
import { LinkedText } from "@/components/LinkedText";
import {
  readerLineGapEm,
  splitReadableLines,
  splitReaderLines,
} from "@/lib/reader-paragraphs";

export function ReaderBody({
  text,
  id,
  className,
  link = true,
  readable = false,
  ...attrs
}: {
  text: string;
  id?: string;
  className?: string;
  link?: boolean;
  /** 改行が無い長文（翻訳結果など）を句点でも段落にする */
  readable?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  const lines = readable ? splitReadableLines(text) : splitReaderLines(text);
  if (lines.length === 0) {
    return null;
  }
  return (
    <div id={id} className={className} {...attrs}>
      {lines.map((line, index) => {
        const previous = index > 0 ? lines[index - 1] : undefined;
        const gap = readerLineGapEm(line, previous);
        return (
          <p
            key={line.offset}
            style={{ marginTop: `${gap}em`, marginBottom: 0 }}
          >
            {link ? (
              <LinkedText text={line.text} keyPrefix={`l${line.offset}`} />
            ) : (
              line.text
            )}
          </p>
        );
      })}
    </div>
  );
}
