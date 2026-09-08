"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  getLibraryNeighborsServerSnapshot,
  neighborsAround,
  readLibraryNeighbors,
  subscribeLibraryNeighbors,
} from "@/lib/library-neighbors";

export function ReaderNeighbors({
  sourceId,
  label = "前後の記事",
}: {
  sourceId: string;
  label?: string;
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
