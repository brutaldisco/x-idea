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

export function SyncLimitsForm({ syncMaxPerRun }: { syncMaxPerRun: number }) {
  const [sync, setSync] = useState(String(syncMaxPerRun));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const lastSaved = useRef(syncMaxPerRun);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGen = useRef(0);

  const persist = useCallback((nextSync: string, reportInvalid: boolean) => {
    const syncVal = parseLimit(nextSync, 10, 500);
    if (syncVal === null) {
      if (reportInvalid) {
        setMessage("件数は 10〜500 の数値にしてください。");
      }
      return;
    }
    if (syncVal === lastSaved.current) {
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
      }),
    })
      .then((res) => {
        if (gen !== saveGen.current) return;
        if (res.ok) {
          lastSaved.current = syncVal;
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
  }, []);

  function schedulePersist(nextSync: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      persist(nextSync, false);
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
        persist(sync, true);
      }}
    >
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
            schedulePersist(value);
          }}
          onBlur={() => {
            if (timer.current) clearTimeout(timer.current);
            persist(sync, true);
          }}
          className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-ink-2 text-xs">
          初回・過去取り込みの上限。差分確認は常に 10 件ずつです。10〜500。
        </span>
      </label>
      <p className="text-ink-2 text-xs" aria-live="polite">
        {busy ? "保存中…" : (message ?? "変更すると自動で保存します。")}
      </p>
    </form>
  );
}
