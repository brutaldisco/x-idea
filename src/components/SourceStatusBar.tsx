"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setReadStatus } from "@/server/actions/sources";
import { READ_STATUSES } from "@/server/sources/triage";

const READ_LABELS: Record<(typeof READ_STATUSES)[number], string> = {
  unread: "未読",
  read: "読了",
  to_practice: "実践予定",
  practiced: "実践済",
  knowledged: "KC化",
};

export function SourceStatusBar({
  id,
  readStatus,
}: {
  id: string;
  readStatus: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div
      className="notranslate fixed inset-x-0 z-20 border-line border-t bg-paper/95 px-4 py-2 backdrop-blur bottom-[calc(7.25rem+env(safe-area-inset-bottom))] min-[48rem]:bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
      lang="ja"
      translate="no"
    >
      <div className="mx-auto flex max-w-4xl items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {READ_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              disabled={busy || readStatus === status}
              onClick={() => {
                setBusy(true);
                void setReadStatus({ id, status }).then((result) => {
                  setBusy(false);
                  if (!result.ok) {
                    setMessage(result.error.message);
                    return;
                  }
                  setMessage(`${READ_LABELS[status]}にしました`);
                  startTransition(() => router.refresh());
                });
              }}
              className={`min-h-9 shrink-0 rounded-full px-3 text-xs ${
                readStatus === status
                  ? "bg-ink text-paper"
                  : "border border-line text-ink-2"
              }`}
            >
              {READ_LABELS[status]}
            </button>
          ))}
        </div>
        <a
          href="#note"
          className="min-h-9 shrink-0 rounded-full border border-line px-3 text-xs leading-9"
        >
          メモ
        </a>
      </div>
      {message ? (
        <p
          className="mx-auto mt-1 max-w-4xl text-ink-2 text-xs"
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
