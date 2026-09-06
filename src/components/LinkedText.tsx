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
      {splitHttpUrls(text).map((part, index) => {
        if (part.href) {
          return (
            <a
              key={`u-${index}`}
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
          return <span key={`t-${index}`}>{renderPlain(part.text)}</span>;
        }
        return <span key={`t-${index}`}>{part.text}</span>;
      })}
    </>
  );
}
