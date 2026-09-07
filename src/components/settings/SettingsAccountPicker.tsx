import Link from "next/link";
import { setAccountContextAction } from "@/app/(tabs)/settings/actions";
import type { XAccountPublic } from "@/server/x/account";

export function SettingsAccountPicker({
  accounts,
  currentId,
  maxAccounts,
}: {
  accounts: XAccountPublic[];
  currentId: string | null;
  maxAccounts: number;
}) {
  const canAdd = accounts.length < maxAccounts;
  const current = accounts.find((account) => account.id === currentId) ?? null;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink-2 text-xs">このアカウントの設定</p>
          <h2 className="mt-1 truncate font-semibold">
            {current ? `@${current.username}` : "未連携"}
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-ink-2 text-xs">
          {accounts.length} / {maxAccounts}
        </span>
      </div>
      <p className="mt-2 text-ink-2 text-sm">
        下の連携と分類は、選んだアカウントのものです。
      </p>
      {accounts.length === 0 ? (
        <p className="mt-3 text-ink-2 text-sm">
          ブックマークの取り込みに X 連携が必要です。
        </p>
      ) : accounts.length > 1 ? (
        <div className="mt-4">
          <p className="text-ink-2 text-xs">表示するアカウント</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...accounts].toReversed().map((account) => {
              const selected = account.id === currentId;
              if (selected) {
                return (
                  <span
                    key={account.id}
                    className="rounded-full bg-ink px-3 py-1.5 text-paper text-sm"
                  >
                    @{account.username}
                  </span>
                );
              }
              return (
                <form key={account.id} action={setAccountContextAction}>
                  <input type="hidden" name="id" value={account.id} />
                  <button
                    type="submit"
                    className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-paper"
                  >
                    @{account.username}
                  </button>
                </form>
              );
            })}
          </div>
        </div>
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
