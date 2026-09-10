"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useSyncExternalStore } from "react";
import {
  getLibraryHrefServerSnapshot,
  getLibraryHrefSnapshot,
  subscribeLibraryVisit,
} from "@/lib/library-scroll";
import { initialTab, rememberTab, TABS } from "@/lib/tab-nav";

export function TabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const lastTab = useRef(initialTab(pathname));
  lastTab.current = rememberTab(pathname, lastTab.current);
  const active = lastTab.current;
  const libraryHref = useSyncExternalStore(
    subscribeLibraryVisit,
    getLibraryHrefSnapshot,
    getLibraryHrefServerSnapshot,
  );

  return (
    <nav
      className="notranslate border-line border-t bg-paper/90 backdrop-blur"
      lang="ja"
      translate="no"
    >
      <ul className="mx-auto flex max-w-3xl justify-between gap-0.5 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {TABS.map((tab) => {
          const isActive = tab.href === active;
          const href = tab.href === "/library" ? libraryHref : tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={href}
                scroll={tab.href === "/library" ? false : undefined}
                className={`block rounded-full px-1.5 py-2 text-xs min-[48rem]:px-2 min-[48rem]:text-sm ${
                  isActive ? "bg-paper-2 font-semibold text-ink" : "text-ink-2"
                }`}
                onClick={(event) => {
                  if (tab.href !== "/library" || href === "/library") {
                    return;
                  }
                  event.preventDefault();
                  router.push(href, { scroll: false });
                }}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
