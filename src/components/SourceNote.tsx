"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { saveNote } from "@/server/actions/sources";

export function SourceNote({
  id,
  userNote,
}: {
  id: string;
  userNote: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [note, setNote] = useState(userNote ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNote(userNote ?? "");
  }, [userNote]);

  return (
    <section
      id="note"
      className="notranslate mt-10 scroll-mt-16 border-ink border-l-2 pl-4"
      lang="ja"
      translate="no"
    >
      <p className="text-ink-2 text-xs">自分のメモ</p>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={4}
        className="mt-2 w-full rounded-[var(--radius-card)] border border-line bg-paper p-3 text-sm"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void saveNote({ id, note }).then((result) => {
            setBusy(false);
            if (!result.ok) {
              setMessage(result.error.message);
              return;
            }
            setMessage("メモを保存しました");
            startTransition(() => router.refresh());
          });
        }}
        className="mt-2 min-h-11 rounded-full bg-ink px-4 text-paper text-sm"
      >
        メモを保存
      </button>
      {message ? (
        <p className="mt-2 text-ink-2 text-xs" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
