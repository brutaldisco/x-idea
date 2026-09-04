"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { XAccountPublic } from "@/server/x/account";

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
      className={`ml-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
        enabled
          ? "bg-ok"
          : inverted
            ? "border border-paper/70"
            : "border border-ink-2"
      }`}
    />
  );
}

export function AccountSwitcher({
  accounts,
  currentId,
}: {
  accounts: XAccountPublic[];
  currentId: string | null;
}) {
  const router = useRouter();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const current =
    accounts.find((account) => account.id === currentId) ?? accounts[0] ?? null;

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

  if (!current) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 z-30 min-[48rem]:bottom-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      {open ? (
        <div
          id={panelId}
          className="mb-2 w-56 rounded-2xl border border-line bg-paper/95 p-3 shadow-card backdrop-blur"
        >
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
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`@${current.username}。アカウントを切り替える`}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex max-w-[11rem] items-center rounded-full border border-line bg-paper/90 px-3 py-1.5 text-left text-sm font-medium shadow-card backdrop-blur"
      >
        <span className="truncate">@{current.username}</span>
        <SyncBullet enabled={current.syncEnabled} />
      </button>
    </div>
  );
}
