"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AccountSyncToggle({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <label className="mt-3 flex items-center justify-between gap-3">
      <span className="text-sm">
        同期（課金）
        <span className="ml-2 text-ink-2 text-xs">
          {enabled ? "ON" : "OFF"}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void fetch("/api/x/connection", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, sync_enabled: !enabled }),
          })
            .then((res) => {
              if (res.ok) {
                router.refresh();
              }
            })
            .finally(() => {
              setBusy(false);
            });
        }}
        className={`relative h-7 w-12 rounded-full transition-colors ${
          enabled ? "bg-ink" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-paper transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}
