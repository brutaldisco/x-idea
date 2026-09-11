"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  getLibraryNeighborsServerSnapshot,
  neighborsAround,
  readLibraryNeighbors,
  subscribeLibraryNeighbors,
} from "@/lib/library-neighbors";

const iconBtnClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line text-ink-2 hover:bg-paper";

function ChevronIcon({ direction }: { direction: "prev" | "next" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === "prev" ? (
        <path d="M15 6 9 12l6 6" />
      ) : (
        <path d="M9 6l6 6-6 6" />
      )}
    </svg>
  );
}

function NeighborIcon({
  href,
  direction,
  label,
  transitionTypes,
}: {
  href: string | null;
  direction: "prev" | "next";
  label: string;
  transitionTypes: string[];
}) {
  const icon = <ChevronIcon direction={direction} />;
  if (!href) {
    return (
      <span className={`${iconBtnClass} pointer-events-none opacity-40`}>
        {icon}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      transitionTypes={transitionTypes}
      aria-label={label}
      className={iconBtnClass}
    >
      {icon}
    </Link>
  );
}

export function ReaderNeighbors({
  sourceId,
  label = "前後の記事",
  variant = "links",
}: {
  sourceId: string;
  label?: string;
  variant?: "links" | "icons";
}) {
  const ids = useSyncExternalStore(
    subscribeLibraryNeighbors,
    readLibraryNeighbors,
    getLibraryNeighborsServerSnapshot,
  );
  const { prevId, nextId } = neighborsAround(ids, sourceId);
  if (!prevId && !nextId) {
    return null;
  }

  if (variant === "icons") {
    return (
      <nav className="flex items-center gap-1.5" aria-label={label}>
        <NeighborIcon
          href={prevId ? `/source/${prevId}` : null}
          direction="prev"
          label="前の記事"
          transitionTypes={["nav-back"]}
        />
        <NeighborIcon
          href={nextId ? `/source/${nextId}` : null}
          direction="next"
          label="次の記事"
          transitionTypes={["nav-forward"]}
        />
      </nav>
    );
  }

  return (
    <nav
      className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm"
      aria-label={label}
    >
      {prevId ? (
        <Link
          href={`/source/${prevId}`}
          scroll={false}
          transitionTypes={["nav-back"]}
          className="text-ink-2 hover:underline"
        >
          ← 前の記事
        </Link>
      ) : (
        <span />
      )}
      {nextId ? (
        <Link
          href={`/source/${nextId}`}
          scroll={false}
          transitionTypes={["nav-forward"]}
          className="text-ink-2 hover:underline"
        >
          次の記事 →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
