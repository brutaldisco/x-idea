import type { ReactNode } from "react";
import { splitHttpUrls } from "@/lib/linkify";

export function LinkedText({
  text,
  renderPlain,
  keyPrefix = "",
}: {
  text: string;
  renderPlain?: (text: string) => ReactNode;
  keyPrefix?: string;
}) {
  return (
    <>
      {splitHttpUrls(text).map((part) => {
        const key = `${keyPrefix}:${part.offset}:${part.href ?? "t"}`;
        if (part.href) {
          return (
            <a
              key={key}
              href={part.href}
              target="_blank"
              rel="noreferrer"
              className="wrap-anywhere text-accent underline decoration-accent/50"
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
