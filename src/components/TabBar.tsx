"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { XAccountPublic } from "@/server/x/account";

const TABS = [
  { href: "/today", label: "Today" },
  { href: "/inbox", label: "Inbox" },
  { href: "/library", label: "Library" },
  { href: "/ask", label: "Ask" },
  { href: "/settings", label: "Settings" },
] as const;

function SyncBullet({
  enabled,
  inverted = false,
}: {
  enabled: boolean;
  inverted?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={enabled ? "同期ON" : "同期OFF"}
      title={enabled ? "同期ON" : "同期OFF"}
      className={`ml-2 inline-block h-2 w-2 rounded-full ${
        enabled
          ? "bg-ok"
          : inverted
            ? "border border-paper/70"
            : "border border-ink-2"
      }`}
    />
  );
}

function currentTab(pathname: string): (typeof TABS)[number]["href"] {
  const hit = TABS.find(
    (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  );
  return hit?.href ?? "/today";
}

export function TabBar({
  accounts,
  currentId,
}: {
  accounts: XAccountPublic[];
  currentId: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const panelId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const current =
    accounts.find((account) => account.id === currentId) ?? accounts[0] ?? null;
  const active = currentTab(pathname);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  return (
    <nav
      ref={rootRef}
      className="fixed inset-x-0 bottom-0 z-20 border-line border-t bg-paper/90 backdrop-blur"
    >
      <div className="mx-auto max-w-lg">
        {open && current ? (
          <div id={panelId} className="border-line border-b px-4 py-3">
            <p className="text-ink-2 text-xs">アカウントを切り替える</p>
            <ul className="mt-2 space-y-1">
              {accounts.map((account) => {
                const selected = account.id === current.id;
                return (
                  <li key={account.id}>
                    <button
                      type="button"
                      disabled={busy || selected}
                      onClick={() => {
                        if (selected) {
                          setOpen(false);
                          return;
                        }
                        setBusy(true);
                        void fetch("/api/x/context", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ctx: account.id }),
                        })
                          .then((res) => {
                            if (res.ok) {
                              setOpen(false);
                              startTransition(() => router.refresh());
                            }
                          })
                          .finally(() => setBusy(false));
                      }}
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                        selected
                          ? "bg-ink font-medium text-paper"
                          : "bg-paper-2 text-ink"
                      }`}
                    >
                      @{account.username}
                      <SyncBullet
                        enabled={account.syncEnabled}
                        inverted={selected}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <div className="flex items-center gap-2 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {current ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={`@${current.username}。アカウントを切り替える`}
              onClick={() => setOpen((value) => !value)}
              className="inline-flex max-w-[7.5rem] shrink-0 items-center truncate rounded-full px-2 py-1.5 text-left text-sm font-medium"
            >
              <span className="truncate">@{current.username}</span>
              <SyncBullet enabled={current.syncEnabled} />
            </button>
          ) : null}
          <ul className="flex min-w-0 flex-1 justify-between">
            {TABS.map((tab) => {
              const isActive = tab.href === active;
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    className={`block rounded-full px-2 py-2 text-sm ${
                      isActive
                        ? "bg-paper-2 font-semibold text-ink"
                        : "text-ink-2"
                    }`}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}
