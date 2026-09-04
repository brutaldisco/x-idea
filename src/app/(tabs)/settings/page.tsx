import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DisconnectX } from "@/components/DisconnectX";
import { getHealth } from "@/server/health";
import { listXAccounts, MAX_X_ACCOUNTS } from "@/server/x/account";

async function SettingsBody({
  searchParams,
}: {
  searchParams: Promise<{ x?: string }>;
}) {
  await connection();
  const [health, accounts, params] = await Promise.all([
    getHealth(),
    listXAccounts(),
    searchParams,
  ]);
  const canAdd = accounts.length < MAX_X_ACCOUNTS;
  return (
    <div className="space-y-3">
      {params.x === "missing" ? (
        <p className="rounded-xl bg-warn/20 px-3 py-2 text-sm">
          X_CLIENT_ID が未設定です。Vercel の環境変数を入れてください。
        </p>
      ) : null}
      {params.x === "denied" ? (
        <p className="rounded-xl bg-warn/20 px-3 py-2 text-sm">
          X 連携がキャンセルされました。
        </p>
      ) : null}
      {params.x === "limit" ? (
        <p className="rounded-xl bg-warn/20 px-3 py-2 text-sm">
          X アカウントは最大 {MAX_X_ACCOUNTS} 件までです。
        </p>
      ) : null}
      {params.x === "same" ? (
        <p className="rounded-xl bg-warn/20 px-3 py-2 text-sm">
          同じアカウントが再連携されました。追加するときは、別のユーザー名またはメールを入力してください。
        </p>
      ) : null}
      {params.x === "hint" ? (
        <p className="rounded-xl bg-warn/20 px-3 py-2 text-sm">
          ユーザー名またはメールアドレスを入力してください。
        </p>
      ) : null}
      <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">X 連携</h2>
          <span className="rounded-full bg-paper px-2 py-0.5 text-ink-2 text-xs">
            {accounts.length} / {MAX_X_ACCOUNTS}
          </span>
        </div>
        {accounts.length === 0 ? (
          <p className="mt-2 text-ink-2 text-sm">
            ブックマークの取り込みに X 連携が必要です。
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="rounded-xl border border-line bg-paper p-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm">@{account.username}</p>
                  <span className="text-ink-2 text-xs">{account.status}</span>
                </div>
                <p className="mt-1 text-ink-2 text-xs">
                  同期トグルは OFF のままです。クレジット購入後に人間が ON
                  にします。
                </p>
                <DisconnectX id={account.id} />
              </li>
            ))}
          </ul>
        )}
        {canAdd ? (
          <Link
            href={
              accounts.length === 0
                ? "/api/x/oauth/start?next=/settings"
                : "/settings/x/add"
            }
            className="mt-3 inline-block rounded-full bg-ink px-4 py-2 text-paper text-sm"
          >
            {accounts.length === 0 ? "X と連携" : "アカウントを追加"}
          </Link>
        ) : (
          <p className="mt-3 text-ink-2 text-xs">
            上限 {MAX_X_ACCOUNTS} 件に達しています。
          </p>
        )}
      </article>
      <ServiceCard
        name="X API"
        state={health.x_api_enabled ? "有料ON" : "停止"}
        note="クレジット未購入のため同期は OFF のままです。"
      />
      <ServiceCard
        name="Gemini"
        state="無料枠"
        note="有料トグルは既定 OFF。429 で自動 ON しません。"
      />
      <ServiceCard
        name="Turso"
        state={health.db === "ok" ? "無料枠" : health.db}
        note={health.db}
      />
      <ServiceCard
        name="Vercel"
        state="無料枠"
        note="https://x-idea.vercel.app · hnd1"
      />
    </div>
  );
}

function ServiceCard({
  name,
  state,
  note,
}: {
  name: string;
  state: string;
  note: string;
}) {
  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{name}</h2>
        <span className="rounded-full bg-paper px-2 py-0.5 text-ink-2 text-xs">
          {state}
        </span>
      </div>
      <p className="mt-2 text-ink-2 text-sm">{note}</p>
    </article>
  );
}

export default function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ x?: string }>;
}) {
  return (
    <main className="px-4 pt-8">
      <p className="text-ink-2 text-sm">Settings</p>
      <h1 className="font-semibold text-2xl">設定</h1>
      <p className="mt-2 mb-6 text-ink-2 text-sm">
        有料プランはすべて OFF です。契約後に人間が切り替えます。
      </p>
      <Suspense fallback={<p className="text-ink-2 text-sm">読み込み中…</p>}>
        <SettingsBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
