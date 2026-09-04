"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SettingsFlagToggle({
  field,
  enabled,
  label,
  hint,
}: {
  field: "x_api_enabled" | "thread_expand_enabled" | "reply_context_enabled";
  enabled: boolean;
  label: string;
  hint?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <label className="mt-3 flex items-center justify-between gap-3">
      <span className="text-sm">
        {label}
        <span className="ml-2 text-ink-2 text-xs">
          {enabled ? "ON" : "OFF"}
        </span>
        {hint ? (
          <span className="mt-1 block text-ink-2 text-xs">{hint}</span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void fetch("/api/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [field]: !enabled }),
          })
            .then((res) => {
              if (res.ok) {
                router.refresh();
              }
            })
            .finally(() => setBusy(false));
        }}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
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
