import type { ReactNode } from "react";
import { splitHttpUrls } from "@/lib/linkify";

export function LinkedText({
  text,
  renderPlain,
}: {
  text: string;
  renderPlain?: (text: string) => ReactNode;
}) {
  return (
    <>
      {splitHttpUrls(text).map((part) => {
        const key = `${part.offset}:${part.href ?? "t"}`;
        if (part.href) {
          return (
            <a
              key={key}
              href={part.href}
              target="_blank"
              rel="noreferrer"
              className="break-all text-accent/55 underline decoration-accent/30"
            >
              {part.text}
            </a>
          );
        }
        if (!part.text) {
          return null;
        }
        if (renderPlain) {
          return <span key={key}>{renderPlain(part.text)}</span>;
        }
        return <span key={key}>{part.text}</span>;
      })}
    </>
  );
}
