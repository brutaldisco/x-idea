"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  archiveSource,
  confirmSource,
  reenrich,
  saveNote,
  setReadStatus,
  snoozeSource,
} from "@/server/actions/sources";
import { INFO_TYPE_LABELS, type InfoType } from "@/server/ai/info-types";
import { READ_STATUSES } from "@/server/sources/triage";

const READ_LABELS: Record<(typeof READ_STATUSES)[number], string> = {
  unread: "未読",
  read: "読了",
  to_practice: "実践予定",
  practiced: "実践済",
  knowledged: "KC化",
};

export function SourceActions({
  id,
  triageStatus,
  readStatus,
  userNote,
  categoryId,
  infoType,
}: {
  id: string;
  triageStatus: string;
  readStatus: string;
  userNote: string | null;
  categoryId: string | null;
  infoType: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [note, setNote] = useState(userNote ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNote(userNote ?? "");
  }, [userNote]);
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

  return (
    <section className="notranslate mt-8 border-line border-t pt-6" lang="ja">
      {open ? (
        <div className="mb-4 grid grid-cols-3 gap-2">
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
            className="rounded-full border border-line py-2 text-sm"
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
            className="rounded-full border border-line py-2 text-sm"
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
            className="rounded-full bg-ink py-2 text-paper text-sm"
          >
            確定
          </button>
        </div>
      ) : (
        <p className="mb-3 text-ink-2 text-xs">状態: {triageStatus}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {READ_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            disabled={busy || readStatus === status}
            onClick={() => {
              setBusy(true);
              void setReadStatus({ id, status }).then((result) => {
                setBusy(false);
                after(result, `${READ_LABELS[status]}にしました`);
              });
            }}
            className={`rounded-full px-3 py-1 text-xs ${
              readStatus === status
                ? "bg-ink text-paper"
                : "border border-line text-ink-2"
            }`}
          >
            {READ_LABELS[status]}
          </button>
        ))}
      </div>

      <label className="mt-5 block">
        <span className="text-ink-2 text-xs">自分のメモ</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          className="mt-1 w-full rounded-[var(--radius-card)] border border-line bg-paper-2 p-3 text-sm"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void saveNote({ id, note }).then((result) => {
              setBusy(false);
              after(result, "メモを保存しました");
            });
          }}
          className="rounded-full bg-ink px-4 py-2 text-paper text-sm"
        >
          メモを保存
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void reenrich(id).then((result) => {
              setBusy(false);
              after(result, "再処理をキューに入れました");
            });
          }}
          className="rounded-full border border-line px-4 py-2 text-sm"
        >
          AI で再処理
        </button>
      </div>
      {infoType && infoType in INFO_TYPE_LABELS ? (
        <p className="mt-3 text-ink-2 text-xs">
          情報タイプ: {INFO_TYPE_LABELS[infoType as InfoType]}
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 text-ink-2 text-xs" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
