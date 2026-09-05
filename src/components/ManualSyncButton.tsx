"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ManualSyncButton({
  disabled,
  hint,
  align = "start",
  className,
}: {
  disabled: boolean;
  hint?: string;
  align?: "start" | "center";
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div
      className={
        className ?? (align === "center" ? "mt-3 text-center" : "mt-3")
      }
    >
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => {
          setBusy(true);
          setMessage(null);
          void fetch("/api/sync", { method: "POST" })
            .then(async (res) => {
              if (res.status === 429) {
                setMessage("60秒待ってから再実行してください。");
                return;
              }
              if (!res.ok) {
                setMessage("同期を開始できませんでした。");
                return;
              }
              setMessage("同期を実行しました。");
              router.refresh();
            })
            .finally(() => setBusy(false));
        }}
        className="rounded-full bg-ink px-4 py-2 text-paper text-sm disabled:opacity-40"
      >
        {busy ? "同期中…" : "今すぐ同期"}
      </button>
      {hint && disabled ? (
        <p className="mt-2 text-ink-2 text-xs">{hint}</p>
      ) : null}
      {message ? <p className="mt-2 text-ink-2 text-xs">{message}</p> : null}
    </div>
  );
}
