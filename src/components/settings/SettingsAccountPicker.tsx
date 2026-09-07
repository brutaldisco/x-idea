import Link from "next/link";
import {
  setAccountContextAction,
  setDefaultXAccountAction,
} from "@/app/(tabs)/settings/actions";
import type { XAccountPublic } from "@/server/x/account";

export function SettingsAccountPicker({
  accounts,
  currentId,
  defaultId,
  maxAccounts,
}: {
  accounts: XAccountPublic[];
  currentId: string | null;
  defaultId: string | null;
  maxAccounts: number;
}) {
  const canAdd = accounts.length < maxAccounts;
  const defaultAccount = accounts.find((account) => account.id === defaultId);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">アカウント</h2>
        <span className="rounded-full bg-paper px-2 py-0.5 text-ink-2 text-xs">
          {accounts.length} / {maxAccounts}
        </span>
      </div>
      {accounts.length === 0 ? (
        <p className="mt-2 text-ink-2 text-sm">
          ブックマークの取り込みに X 連携が必要です。
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {[...accounts].toReversed().map((account) => {
            const selected = account.id === currentId;
            const isDefault = account.id === defaultId;
            return (
              <li
                key={account.id}
                className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-paper px-3 py-2"
              >
                {selected ? (
                  <span className="rounded-full bg-ink px-3 py-1.5 text-paper text-sm">
                    @{account.username}
                  </span>
                ) : (
                  <form action={setAccountContextAction}>
                    <input type="hidden" name="id" value={account.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-paper-2"
                    >
                      @{account.username}
                    </button>
                  </form>
                )}
                {selected ? (
                  <span className="text-ink-2 text-xs">表示中</span>
                ) : null}
                {isDefault ? (
                  <span className="rounded-full bg-paper-2 px-2 py-0.5 text-ink-2 text-xs">
                    既定
                  </span>
                ) : (
                  <form action={setDefaultXAccountAction}>
                    <input type="hidden" name="id" value={account.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-paper-2"
                    >
                      既定にする
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {accounts.length > 0 ? (
        <p className="mt-3 text-ink-2 text-xs">
          既定は、Cookie が無いとき（別のブラウザや初回）に開くアカウントです。
          {defaultAccount
            ? ` いまの既定は @${defaultAccount.username}。`
            : " 未設定のときは先頭アカウントを開きます。"}
        </p>
      ) : null}
      {canAdd ? (
        <Link
          href={
            accounts.length === 0
              ? "/api/x/oauth/start?next=/settings"
              : "/settings/x/add"
          }
          className={
            accounts.length === 0
              ? "mt-3 inline-block rounded-full bg-ink px-4 py-2 text-paper text-sm"
              : "mt-3 inline-block text-ink-2 text-xs hover:underline"
          }
        >
          {accounts.length === 0 ? "X と連携" : "アカウントを追加"}
        </Link>
      ) : (
        <p className="mt-3 text-ink-2 text-xs">
          上限 {maxAccounts} 件に達しています。
        </p>
      )}
    </div>
  );
}
