"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useSyncExternalStore } from "react";
import {
  getLibraryHrefServerSnapshot,
  getLibraryHrefSnapshot,
  subscribeLibraryVisit,
} from "@/lib/library-scroll";

export function LibraryBackLink({
  children = "← ライブラリ",
  className = "text-ink-2 text-sm hover:underline",
}: {
  children?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const href = useSyncExternalStore(
    subscribeLibraryVisit,
    getLibraryHrefSnapshot,
    getLibraryHrefServerSnapshot,
  );
  return (
    <Link
      href={href}
      scroll={false}
      transitionTypes={["nav-back"]}
      className={className}
      onClick={(event) => {
        if (href === "/library") {
          return;
        }
        event.preventDefault();
        router.push(href, { scroll: false });
      }}
    >
      {children}
    </Link>
  );
}
