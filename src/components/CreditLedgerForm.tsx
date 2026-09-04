"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { X_DEVELOPER_CONSOLE_URL } from "@/lib/x-console";

export function CreditLedgerForm() {
  const router = useRouter();
  const [amount, setAmount] = useState("10");
  const [kind, setKind] = useState<"topup" | "snapshot">("topup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-4 space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        void fetch("/api/x/credits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            amount_usd: Number(amount),
          }),
        })
          .then(async (res) => {
            if (!res.ok) {
              const body = (await res.json()) as {
                error?: { message?: string };
              };
              throw new Error(body.error?.message ?? "記録に失敗しました");
            }
            setAmount("");
            router.refresh();
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "記録に失敗しました");
          })
          .finally(() => setBusy(false));
      }}
    >
      <p className="text-ink-2 text-xs">
        なくなったら Developer Console
        で追加し、ここに記録します。残量をコンソールと合わせたいときは「いまの残量」。{" "}
        <a
          href={X_DEVELOPER_CONSOLE_URL}
          className="break-all underline"
          target="_blank"
          rel="noreferrer"
        >
          {X_DEVELOPER_CONSOLE_URL}
        </a>
      </p>
      <div className="flex gap-2">
        <label className="flex items-center gap-1 text-xs">
          <input
            type="radio"
            name="credit-kind"
            checked={kind === "topup"}
            onChange={() => setKind("topup")}
          />
          追加した額
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="radio"
            name="credit-kind"
            checked={kind === "snapshot"}
            onChange={() => setKind("snapshot")}
          />
          いまの残量
        </label>
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min={0.01}
          max={1000}
          step="any"
          inputMode="decimal"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-sm"
          placeholder="10.00"
          aria-label="金額 USD"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-ink px-4 py-2 text-paper text-sm"
        >
          {busy ? "記録中…" : "記録"}
        </button>
      </div>
      {error ? <p className="text-danger text-xs">{error}</p> : null}
    </form>
  );
}

export function UsageRefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void fetch("/api/x/credits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "refresh" }),
        })
          .then(() => router.refresh())
          .finally(() => setBusy(false));
      }}
      className="text-ink-2 text-xs underline"
    >
      {busy ? "更新中…" : "残量を再取得"}
    </button>
  );
}
