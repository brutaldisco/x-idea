"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  archiveSource,
  confirmSource,
  snoozeSource,
} from "@/server/actions/sources";
import { INFO_TYPE_LABELS, type InfoType } from "@/server/ai/info-types";

export function SourceActions({
  id,
  triageStatus,
  categoryId,
  infoType,
}: {
  id: string;
  triageStatus: string;
  categoryId: string | null;
  infoType: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = triageStatus === "needs_review" || triageStatus === "pending";

  function after(
    result: { ok: true } | { ok: false; error: { message: string } },
    okText: string,
  ) {
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage(okText);
    startTransition(() => router.refresh());
  }

  if (!open) {
    return null;
  }

  return (
    <section className="notranslate mt-6" lang="ja">
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void archiveSource(id).then((result) => {
              setBusy(false);
              after(result, "アーカイブしました");
            });
          }}
          className="min-h-11 rounded-full border border-line text-sm"
        >
          アーカイブ
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void snoozeSource({ id }).then((result) => {
              setBusy(false);
              after(result, "明日まで後回しにしました");
            });
          }}
          className="min-h-11 rounded-full border border-line text-sm"
        >
          後で
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void confirmSource({
              id,
              category_id: categoryId ?? undefined,
              info_type:
                infoType && infoType in INFO_TYPE_LABELS
                  ? (infoType as InfoType)
                  : undefined,
            }).then((result) => {
              setBusy(false);
              after(result, "確定しました");
            });
          }}
          className="min-h-11 rounded-full bg-ink text-paper text-sm"
        >
          確定
        </button>
      </div>
      {message ? (
        <p className="mt-2 text-ink-2 text-xs" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
