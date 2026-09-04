"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "Today" },
  { href: "/inbox", label: "Inbox" },
  { href: "/library", label: "Library" },
  { href: "/ask", label: "Ask" },
  { href: "/settings", label: "Settings" },
] as const;

function currentTab(pathname: string): (typeof TABS)[number]["href"] {
  const hit = TABS.find(
    (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  );
  return hit?.href ?? "/today";
}

export function TabBar() {
  const active = currentTab(usePathname());

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-line border-t bg-paper/90 backdrop-blur">
      <ul className="mx-auto flex max-w-3xl justify-between px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {TABS.map((tab) => {
          const isActive = tab.href === active;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`block rounded-full px-2 py-2 text-sm ${
                  isActive ? "bg-paper-2 font-semibold text-ink" : "text-ink-2"
                }`}
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
