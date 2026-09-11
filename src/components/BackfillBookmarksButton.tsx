"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { resetLibraryQueries } from "@/lib/library-cache";
import { clearSourcesHttpCache } from "@/lib/pwa";

export function BackfillBookmarksButton({
  accountId,
  disabled,
  exhausted,
}: {
  accountId: string;
  disabled: boolean;
  exhausted: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => {
          setBusy(true);
          setMessage(null);
          void fetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "backfill",
              x_account_id: accountId,
            }),
          })
            .then(async (res) => {
              if (res.status === 429) {
                setMessage("60秒待ってから再実行してください。");
                return;
              }
              if (!res.ok) {
                setMessage("取り込みを開始できませんでした。");
                return;
              }
              setMessage(
                "過去分の取り込みを実行しました。まだ残っていれば、もう一度押してください。",
              );
              resetLibraryQueries(queryClient);
              void clearSourcesHttpCache();
              router.refresh();
            })
            .finally(() => setBusy(false));
        }}
        className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40"
      >
        {busy
          ? "取り込み中…"
          : exhausted
            ? "過去の取り込みを再試行"
            : "過去のブックマークを取り込む"}
      </button>
      <p className="mt-2 text-ink-2 text-xs">
        「今すぐ同期」は新着だけです。こちらは X
        の一覧を古い方へ進めます。1回の件数は下の上限。続きがあるか確かめる読み直しで、同じ上限をもう1回分使うことがあります。保存済みの削除確認は
        1回最大 100 件（$0.005/件）。Owned Read は $0.001/件です。
      </p>
      {exhausted ? (
        <p className="mt-1 text-ink-2 text-xs">
          前回は一覧の末尾まで到達しました。まだ残っているなら再試行できます。
        </p>
      ) : null}
      {message ? <p className="mt-1 text-ink-2 text-xs">{message}</p> : null}
    </div>
  );
}
