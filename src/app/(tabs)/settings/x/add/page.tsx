import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { TabBar } from "@/components/TabBar";
import { ensureSchema } from "@/db/ensure";
import { listXAccounts, MAX_X_ACCOUNTS } from "@/server/x/account";
import { safeNextPath } from "@/server/x/oauth";

export const instant = false;

async function AddBody({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; x?: string }>;
}) {
  await connection();
  await ensureSchema();
  const params = await searchParams;
  const accounts = await listXAccounts();
  if (accounts.length >= MAX_X_ACCOUNTS) {
    redirect("/settings?x=limit");
  }
  const next = safeNextPath(params.next ?? "/settings");

  return (
    <section className="space-y-4">
      {params.x === "same" ? (
        <p className="rounded-xl bg-warn/20 px-3 py-2 text-sm">
          そのアカウントはすでに連携済みです。別のユーザー名またはメールを入力してください。
        </p>
      ) : null}
      {params.x === "hint" ? (
        <p className="rounded-xl bg-warn/20 px-3 py-2 text-sm">
          ユーザー名またはメールアドレスを入力してください。
        </p>
      ) : null}
      {accounts.length > 0 ? (
        <p className="text-ink-2 text-sm">
          連携済み:{" "}
          {accounts.map((account) => `@${account.username}`).join(" / ")}
        </p>
      ) : null}
      <form method="get" action="/api/x/oauth/start" className="space-y-4">
        <input type="hidden" name="force_login" value="1" />
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm">
          ユーザー名またはメールアドレス
          <input
            className="mt-1 w-full rounded-xl border border-line bg-paper-2 px-3 py-2"
            type="text"
            name="hint"
            inputMode="email"
            autoComplete="username"
            placeholder="@another または mail@example.com"
            required
          />
        </label>
        <p className="text-ink-2 text-xs">
          パスワードは X
          の画面で入力します。このアプリには保存しません。次へを押すと、いまの X
          ログインを一度切ってから入力したアカウントの画面を開きます。
        </p>
        <button
          className="w-full rounded-full bg-ink px-4 py-2.5 font-medium text-paper"
          type="submit"
        >
          X のログインへ
        </button>
      </form>
      <Link
        href="/settings"
        className="inline-block text-ink-2 text-sm underline"
      >
        設定に戻る
      </Link>
    </section>
  );
}

export default function AddXAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; x?: string }>;
}) {
  return (
    <>
      <main className="px-4 pt-8">
        <p className="text-ink-2 text-sm">Settings</p>
        <h1 className="font-semibold text-2xl">アカウントを追加</h1>
        <p className="mt-2 mb-6 text-ink-2 text-sm">
          追加したい X のユーザー名またはメールアドレスを入力してください。
        </p>
        <Suspense fallback={<p className="text-ink-2 text-sm">読み込み中…</p>}>
          <AddBody searchParams={searchParams} />
        </Suspense>
      </main>
      <TabBar current="/settings" />
    </>
  );
}
