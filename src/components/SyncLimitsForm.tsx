"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SAVE_DELAY_MS = 500;

function parseLimit(value: string, min: number, max: number): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

export function SyncLimitsForm({
  syncMaxPerRun,
  mediaDownloadPerTick,
}: {
  syncMaxPerRun: number;
  mediaDownloadPerTick: number;
}) {
  const [sync, setSync] = useState(String(syncMaxPerRun));
  const [media, setMedia] = useState(String(mediaDownloadPerTick));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const lastSaved = useRef({
    sync: syncMaxPerRun,
    media: mediaDownloadPerTick,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGen = useRef(0);

  const persist = useCallback(
    (nextSync: string, nextMedia: string, reportInvalid: boolean) => {
      const syncVal = parseLimit(nextSync, 10, 500);
      const mediaVal = parseLimit(nextMedia, 1, 50);
      if (syncVal === null || mediaVal === null) {
        if (reportInvalid) {
          setMessage("件数は 10〜500、メディアは 1〜50 の数値にしてください。");
        }
        return;
      }
      if (
        syncVal === lastSaved.current.sync &&
        mediaVal === lastSaved.current.media
      ) {
        return;
      }
      const gen = ++saveGen.current;
      setBusy(true);
      setMessage(null);
      void fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sync_max_per_run: syncVal,
          media_download_per_tick: mediaVal,
        }),
      })
        .then((res) => {
          if (gen !== saveGen.current) return;
          if (res.ok) {
            lastSaved.current = { sync: syncVal, media: mediaVal };
            setMessage("保存しました。");
          } else {
            setMessage("保存できませんでした。");
          }
        })
        .catch(() => {
          if (gen !== saveGen.current) return;
          setMessage("保存できませんでした。");
        })
        .finally(() => {
          if (gen === saveGen.current) setBusy(false);
        });
    },
    [],
  );

  function schedulePersist(nextSync: string, nextMedia: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      persist(nextSync, nextMedia, false);
    }, SAVE_DELAY_MS);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        persist(sync, media, true);
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
            onChange={(event) => {
              const value = event.target.value;
              setSync(value);
              schedulePersist(value, media);
            }}
            onBlur={() => {
              if (timer.current) clearTimeout(timer.current);
              persist(sync, media, true);
            }}
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-ink-2 text-xs">
            初回・過去取り込みの上限。差分確認は常に 10 件ずつです。10〜500。
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
            onChange={(event) => {
              const value = event.target.value;
              setMedia(value);
              schedulePersist(sync, value);
            }}
            onBlur={() => {
              if (timer.current) clearTimeout(timer.current);
              persist(sync, media, true);
            }}
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-ink-2 text-xs">
            画像・動画のダウンロードを分けて進めます。1〜50。
          </span>
        </label>
      </div>
      <p className="text-ink-2 text-xs" aria-live="polite">
        {busy ? "保存中…" : (message ?? "変更すると自動で保存します。")}
      </p>
    </form>
  );
}
