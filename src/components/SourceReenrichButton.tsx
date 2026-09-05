"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reenrich } from "@/server/actions/sources";

export function SourceReenrichButton({ id }: { id: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void reenrich(id).then((result) => {
            setBusy(false);
            if (!result.ok) {
              setMessage(result.error.message);
              return;
            }
            setMessage("再処理をキューに入れました");
            startTransition(() => router.refresh());
          });
        }}
        className="min-h-11 rounded-full border border-line px-4 text-sm"
      >
        AI で再処理
      </button>
      {message ? (
        <p className="mt-2 text-ink-2 text-xs" aria-live="polite">
          {message}
        </p>
      ) : null}
    </div>
  );
}
