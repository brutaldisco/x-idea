"use client";

import Link from "next/link";
import { AccountSyncDot } from "@/components/AccountSyncDot";
import { useAccountSwitch } from "@/components/useAccountSwitch";
import type { XAccountPublic } from "@/server/x/account";

export function SettingsViewingAccountCard({
  accounts,
  currentId,
}: {
  accounts: XAccountPublic[];
  currentId: string | null;
}) {
  const { busy, switchTo } = useAccountSwitch();
  const current = accounts.find((account) => account.id === currentId) ?? null;

  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
      <p className="text-ink-2 text-xs">表示するアカウント</p>
      <h2 className="mt-1 truncate font-semibold">
        {current ? `@${current.username}` : "未連携"}
      </h2>
      <p className="mt-2 text-ink-2 text-sm">
        Today / Inbox / Library /
        このページの設定は、選んだアカウントだけを見ます。
      </p>
      {accounts.length === 0 ? (
        <Link
          href="/api/x/oauth/start?next=/settings"
          className="mt-3 inline-block rounded-full bg-ink px-4 py-2 text-paper text-sm"
        >
          X と連携
        </Link>
      ) : (
        <ul className="mt-4 space-y-2">
          {[...accounts].toReversed().map((account) => {
            const selected = account.id === currentId;
            return (
              <li key={account.id}>
                {selected ? (
                  <p className="flex items-center justify-between gap-3 rounded-2xl border border-ink bg-paper px-3 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-ink"
                      >
                        <span className="h-2 w-2 rounded-full bg-ink" />
                      </span>
                      <span className="flex min-w-0 items-center">
                        <span className="truncate">@{account.username}</span>
                        <AccountSyncDot enabled={account.syncEnabled} />
                      </span>
                    </span>
                    <span className="shrink-0 text-ink-2 text-xs">表示中</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void switchTo(account.id);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-3 py-2.5 text-left text-sm hover:bg-paper/70 disabled:opacity-60"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-ink-2"
                      />
                      <span className="flex min-w-0 items-center">
                        <span className="truncate">@{account.username}</span>
                        <AccountSyncDot enabled={account.syncEnabled} />
                      </span>
                    </span>
                    <span className="shrink-0 text-ink-2 text-xs">
                      {busy ? "切替中…" : "切り替える"}
                    </span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
