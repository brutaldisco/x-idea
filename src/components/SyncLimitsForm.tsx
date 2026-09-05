"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncLimitsForm({
  syncMaxPerRun,
  mediaDownloadPerTick,
}: {
  syncMaxPerRun: number;
  mediaDownloadPerTick: number;
}) {
  const router = useRouter();
  const [sync, setSync] = useState(String(syncMaxPerRun));
  const [media, setMedia] = useState(String(mediaDownloadPerTick));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setMessage(null);
        void fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sync_max_per_run: Number(sync),
            media_download_per_tick: Number(media),
          }),
        })
          .then((res) => {
            if (res.ok) {
              setMessage("保存しました。");
              router.refresh();
            } else {
              setMessage("保存できませんでした。");
            }
          })
          .finally(() => setBusy(false));
      }}
    >
      <div className="grid grid-cols-1 gap-3 min-[48rem]:grid-cols-2">
        <label className="block rounded-xl border border-line bg-paper p-3 text-sm">
          <span className="text-ink-2 text-xs">1回の同期で取り込む件数</span>
          <input
            type="number"
            min={10}
            max={500}
            step={10}
            value={sync}
            onChange={(event) => setSync(event.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-ink-2 text-xs">
            初回や新着が多いときの上限。差分確認は常に 10 件ずつです。10〜500。
          </span>
        </label>
        <label className="block rounded-xl border border-line bg-paper p-3 text-sm">
          <span className="text-ink-2 text-xs">
            1回の tick で保存するメディア数
          </span>
          <input
            type="number"
            min={1}
            max={50}
            step={1}
            value={media}
            onChange={(event) => setMedia(event.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-ink-2 text-xs">
            画像・動画のダウンロードを分けて進めます。1〜50。
          </span>
        </label>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-ink px-4 py-2 text-paper text-sm disabled:opacity-40"
      >
        {busy ? "保存中…" : "保存"}
      </button>
      {message ? <p className="text-ink-2 text-xs">{message}</p> : null}
    </form>
  );
}
