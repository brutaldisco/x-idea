"use client";

import { type ReactNode, useState } from "react";

export function CollapsibleSection({
  title,
  count,
  children,
  defaultOpen = true,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const label = count != null ? `${title} · ${count}件` : title;
  return (
    <section className="mt-8">
      <button
        type="button"
        className="notranslate flex w-full items-center justify-between gap-3 text-left"
        lang="ja"
        translate="no"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <h2 className="font-semibold text-lg">{label}</h2>
        <span className="shrink-0 text-ink-2 text-sm">
          {open ? "折りたたむ" : "展開"}
        </span>
      </button>
      {open ? <div className="mt-3 space-y-3">{children}</div> : null}
    </section>
  );
}
