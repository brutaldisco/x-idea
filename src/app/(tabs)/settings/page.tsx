import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AccountSyncToggle } from "@/components/AccountSyncToggle";
import { DisconnectX } from "@/components/DisconnectX";
import { ManualSyncButton } from "@/components/ManualSyncButton";
import { MediaFolderLink } from "@/components/MediaFolderLink";
import { MediaUsageCard } from "@/components/MediaUsageCard";
import { SettingsFlagToggle } from "@/components/SettingsFlagToggle";
import { SyncLimitsForm } from "@/components/SyncLimitsForm";
import { UsageMeters } from "@/components/UsageMeters";
import { XApiEnabledToggle } from "@/components/XApiEnabledToggle";
import { getHealth } from "@/server/health";
import { getMediaBlobUsage } from "@/server/media/blob";
import {
  accountMediaDir,
  isLocalMediaEnabled,
  mediaFolderHref,
  mediaRoot,
} from "@/server/media/paths";
import { getContextSettings, getSyncSettings } from "@/server/settings";
import { getUsageDashboard } from "@/server/usage/dashboard";
import { getVideoLibraryUsage } from "@/server/videos/queue";
import { listXAccounts, MAX_X_ACCOUNTS } from "@/server/x/account";

async function SettingsBody({
  searchParams,
}: {
  searchParams: Promise<{ x?: string }>;
}) {
  await connection();
  const [health, accounts, usage, params, flags, sync, blobUsage, videoUsage] =
    await Promise.all([
      getHealth(),
      listXAccounts(),
      getUsageDashboard(),
      searchParams,
      getContextSettings(),
      getSyncSettings(),
      getMediaBlobUsage(),
      getVideoLibraryUsage(),
    ]);
  const canAdd = accounts.length < MAX_X_ACCOUNTS;
  return (
    <div className="space-y-3">
      <article
        className="notranslate rounded-[var(--radius-card)] border border-line bg-paper-2 p-4"
        lang="ja"
        translate="no"
      >
        <h2 className="font-semibold">Chrome で原文を読む</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-2 text-sm">
          <li>Library か Inbox から投稿を開く</li>
          <li>
            原文の下の「日本語に翻訳」を押す（Chrome
            内蔵。サーバーには送らない）
          </li>
          <li>出ないときは「原文を選択」→ 右クリック →「日本語に翻訳」</li>
        </ol>
      </article>
      <UsageMeters data={usage} />
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
                  OFF
                  のあいだ、このアカウントのブックマーク同期は走りません。必要なアカウントだけ
                  ON にしてください。
                </p>
                <AccountSyncToggle
                  id={account.id}
                  enabled={account.syncEnabled}
                />
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
      <MediaUsageCard blobs={blobUsage} videos={videoUsage} />
      <MediaFoldersCard accounts={accounts} />
      <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">X API</h2>
          <span className="rounded-full bg-paper px-2 py-0.5 text-ink-2 text-xs">
            {health.x_api_enabled ? "有料ON" : "停止"}
          </span>
        </div>
        <p className="mt-2 text-ink-2 text-sm">
          全体トグルと、アカウントごとの「同期（課金）」が両方 ON
          のときだけブックマークを取り込みます。1
          回の同期で取り込む件数は下のフォームで調整できます。
        </p>
        <XApiEnabledToggle enabled={health.x_api_enabled} />
        <ManualSyncButton disabled={!health.x_api_enabled} />
        <SyncLimitsForm
          syncMaxPerRun={sync.syncMaxPerRun}
          mediaDownloadPerTick={sync.mediaDownloadPerTick}
        />
        <SettingsFlagToggle
          field="thread_expand_enabled"
          enabled={flags.threadExpandEnabled}
          label="セルフスレッド展開"
          hint="起点投稿の連投を取得します。$0.005/件。既定 OFF。"
        />
        <SettingsFlagToggle
          field="reply_context_enabled"
          enabled={flags.replyContextEnabled}
          label="直近7日の返信を取得"
          hint="会話の返信を最大25件。上限はスレッド展開と共用。既定 OFF。"
        />
      </article>
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

function MediaFoldersCard({
  accounts,
}: {
  accounts: { id: string; username: string }[];
}) {
  const enabled = isLocalMediaEnabled();
  const root = mediaRoot();
  return (
    <details className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
      <summary className="cursor-pointer font-semibold text-sm">
        開発者向け（MEDIA_ROOT）
      </summary>
      <p className="mt-2 text-ink-2 text-sm">
        普段の動画保存は Videos タブのフォルダ選択を使います。
        <code className="text-xs">MEDIA_ROOT</code> と{" "}
        <code className="text-xs">pnpm dev</code> 保存役は開発用途だけです。
      </p>
      {enabled ? (
        <>
          <p className="mt-2 break-all font-mono text-ink-2 text-xs">{root}</p>
          <MediaFolderLink href={mediaFolderHref()} path={root} />
          {accounts.map((account) => (
            <p key={account.id} className="mt-2 text-ink-2 text-xs">
              @{account.username}: {accountMediaDir(account.id)}
            </p>
          ))}
        </>
      ) : (
        <p className="mt-2 text-ink-2 text-xs">
          この環境ではローカルディスクへ書きません。
        </p>
      )}
    </details>
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
        残量が減ったら追加する運用です。有料トグルは人間が切り替えます。
      </p>
      <Suspense fallback={<p className="text-ink-2 text-sm">読み込み中…</p>}>
        <SettingsBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
