"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ContextFetchButton({
  sourceId,
  kind,
  label,
}: {
  sourceId: string;
  kind: "parent" | "thread" | "replies";
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void fetch(`/api/sources/${sourceId}/context`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind }),
          })
            .then(async (res) => {
              if (!res.ok) {
                const body = (await res.json().catch(() => null)) as {
                  error?: { message?: string };
                } | null;
                throw new Error(body?.error?.message ?? "取得に失敗しました");
              }
              router.refresh();
            })
            .catch((err: unknown) => {
              setError(
                err instanceof Error ? err.message : "取得に失敗しました",
              );
            })
            .finally(() => setBusy(false));
        }}
        className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-paper-2 disabled:opacity-50"
      >
        {busy ? "取得中…" : label}
      </button>
      {error ? <p className="mt-1 text-danger text-xs">{error}</p> : null}
    </div>
  );
}
