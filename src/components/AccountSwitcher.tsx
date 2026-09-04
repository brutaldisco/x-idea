"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { XAccountPublic } from "@/server/x/account";
import { ALL_CONTEXT } from "@/server/x/context-const";

type Props = {
  accounts: XAccountPublic[];
  current: string; // "all" or account id
};

export function AccountSwitcher({ accounts, current }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  if (accounts.length === 0) {
    return null;
  }

  const options = [
    { id: ALL_CONTEXT, label: "すべて" },
    ...accounts.map((a) => ({ id: a.id, label: `@${a.username}` })),
  ];

  return (
    <div className="flex gap-1 overflow-x-auto px-4 pb-2">
      {options.map((opt) => {
        const active = opt.id === current;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void fetch("/api/x/context", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ctx: opt.id }),
              })
                .then((res) => {
                  if (res.ok) {
                    startTransition(() => router.refresh());
                  }
                })
                .finally(() => setBusy(false));
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors ${
              active
                ? "bg-ink font-medium text-paper"
                : "border border-line bg-paper-2 text-ink-2"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
