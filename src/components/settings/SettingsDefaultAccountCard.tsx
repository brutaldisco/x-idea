import { setDefaultXAccountAction } from "@/app/(tabs)/settings/actions";
import type { XAccountPublic } from "@/server/x/account";

export function SettingsDefaultAccountCard({
  accounts,
  defaultId,
}: {
  accounts: XAccountPublic[];
  defaultId: string | null;
}) {
  if (accounts.length === 0) {
    return null;
  }

  const defaultAccount = accounts.find((account) => account.id === defaultId);

  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
      <h2 className="font-semibold">既定のアカウント</h2>
      <p className="mt-2 text-ink-2 text-sm">
        別のブラウザや、初めて開いたときに使うアカウントです。上で設定しているアカウントとは別に選べます。
      </p>
      <ul className="mt-4 space-y-2">
        {[...accounts].toReversed().map((account) => {
          const selected = account.id === defaultId;
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
                    <span className="truncate">@{account.username}</span>
                  </span>
                  <span className="shrink-0 text-ink-2 text-xs">使用中</span>
                </p>
              ) : (
                <form action={setDefaultXAccountAction}>
                  <input type="hidden" name="id" value={account.id} />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-3 py-2.5 text-left text-sm hover:bg-paper/70"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-ink-2"
                      />
                      <span className="truncate">@{account.username}</span>
                    </span>
                    <span className="shrink-0 text-ink-2 text-xs">
                      これに変える
                    </span>
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-ink-2 text-xs">
        {defaultAccount
          ? `いまの既定は @${defaultAccount.username}。このブラウザで切り替えた結果は、そのまま残ります。`
          : "未設定のときは、最初に連携したアカウントを開きます。"}
      </p>
    </article>
  );
}
