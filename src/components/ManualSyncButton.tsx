"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { refreshLibraryAfterWrite } from "@/lib/library-cache";
import { describeSyncResult, type SyncOutcome } from "@/lib/sync-status";

type Phase = "idle" | "fetching" | SyncOutcome["phase"];

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
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [detail, setDetail] = useState<string | null>(null);

  const title =
    phase === "fetching"
      ? "取得中…"
      : phase === "done"
        ? "取得済み"
        : phase === "error"
          ? "取得できませんでした"
          : "今すぐ同期";

  return (
    <div
      className={
        className ?? (align === "center" ? "mt-3 text-center" : "mt-3")
      }
    >
      <button
        type="button"
        disabled={disabled || phase === "fetching"}
        aria-busy={phase === "fetching"}
        onClick={() => {
          setPhase("fetching");
          setDetail("X から新着を取得しています。");
          void fetch("/api/sync", { method: "POST" })
            .then(async (res) => {
              if (res.status === 429) {
                setPhase("error");
                setDetail("60秒待ってから再実行してください。");
                return;
              }
              const body = (await res.json().catch(() => null)) as {
                created?: number;
                errors?: number;
              } | null;
              const outcome = describeSyncResult({
                ok: res.ok,
                created: Number(body?.created ?? 0),
                errors: Number(body?.errors ?? 0),
                kind: "sync",
              });
              setPhase(outcome.phase);
              setDetail(outcome.detail);
              if (outcome.phase === "done") {
                await refreshLibraryAfterWrite(queryClient);
                router.refresh();
              }
            })
            .catch(() => {
              setPhase("error");
              setDetail("取得できませんでした。もう一度試してください。");
            });
        }}
        className="rounded-full bg-ink px-4 py-2 text-paper text-sm disabled:opacity-40"
      >
        {title}
      </button>
      {hint && disabled ? (
        <p className="mt-2 text-ink-2 text-xs">{hint}</p>
      ) : null}
      {detail ? (
        <output
          className={`mt-2 block text-xs ${phase === "done" ? "text-ok" : "text-ink-2"}`}
        >
          {phase === "fetching"
            ? "取得中 · "
            : phase === "done"
              ? "取得済み · "
              : ""}
          {detail}
        </output>
      ) : null}
    </div>
  );
}
