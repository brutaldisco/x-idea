import { connection } from "next/server";
import { Suspense } from "react";
import { AccountSyncToggle } from "@/components/AccountSyncToggle";
import { DisconnectX } from "@/components/DisconnectX";
import { ManualSyncButton } from "@/components/ManualSyncButton";
import { MediaFolderLink } from "@/components/MediaFolderLink";
import { MediaUsageCard } from "@/components/MediaUsageCard";
import { InstallAppCard } from "@/components/pwa/InstallAppCard";
import { SettingsFlagToggle } from "@/components/SettingsFlagToggle";
import { SyncLimitsForm } from "@/components/SyncLimitsForm";
import { AccountTaxonomyCard } from "@/components/settings/AccountTaxonomyCard";
import { SettingsAccountPicker } from "@/components/settings/SettingsAccountPicker";
import { UsageMeters } from "@/components/UsageMeters";
import { VideoSaveFolderCard } from "@/components/videos/VideoSaveFolderCard";
import { XApiEnabledToggle } from "@/components/XApiEnabledToggle";
import { getHealth } from "@/server/health";
import { getMediaBlobUsage } from "@/server/media/blob";
import {
  accountMediaDir,
  isLocalMediaEnabled,
  mediaFolderHref,
  mediaRoot,
} from "@/server/media/paths";
import {
  getContextSettings,
  getSyncSettings,
  getVideoSaveFolderName,
} from "@/server/settings";
import { getAccountTaxonomy } from "@/server/taxonomy";
import { getUsageDashboard } from "@/server/usage/dashboard";
import { getVideoLibraryUsage } from "@/server/videos/queue";
import {
  accountHasBookmarkWrite,
  listXAccounts,
  MAX_X_ACCOUNTS,
} from "@/server/x/account";
import { contextLabel, getAccountContext } from "@/server/x/context";

async function SettingsBody({
  searchParams,
}: {
  searchParams: Promise<{ x?: string }>;
}) {
  await connection();
  const [
    health,
    accounts,
    usage,
    params,
    flags,
    sync,
    blobUsage,
    videoUsage,
    ctx,
    videoFolderName,
  ] = await Promise.all([
    getHealth(),
    listXAccounts(),
    getUsageDashboard(),
    searchParams,
    getContextSettings(),
    getSyncSettings(),
    getMediaBlobUsage(),
    getVideoLibraryUsage(),
    getAccountContext(),
    getVideoSaveFolderName(),
  ]);
  const current = ctx.kind === "account" ? ctx.account : null;
  const taxonomy = current ? await getAccountTaxonomy(current.id) : null;
  const canUnbookmark = current
    ? await accountHasBookmarkWrite(current.id)
    : false;
  return (
    <div className="space-y-3">
      <InstallAppCard />
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
      <UsageMeters data={usage} accountId={current?.id ?? null} />
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
      {params.x === "oauth" ? (
        <p className="rounded-xl bg-warn/20 px-3 py-2 text-sm">
          X の許可から戻れませんでした。Chrome か Edge で、この同じアドレスの
          Settings から「連携を更新」をやり直してください。Developer Console の
          Callback にこの環境の URL があるかも確認してください。
        </p>
      ) : null}
      <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
        {current ? (
          <p className="mb-4 text-ink-2 text-xs">
            いまのアカウント · @{current.username}
          </p>
        ) : null}
        <SettingsAccountPicker
          accounts={accounts}
          currentId={current?.id ?? null}
          maxAccounts={MAX_X_ACCOUNTS}
        />
        <section className="mt-7 border-line border-t pt-7">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">X 連携</h3>
            {current ? (
              <span className="rounded-full bg-paper px-2 py-0.5 text-ink-2 text-xs">
                {current.status}
              </span>
            ) : null}
          </div>
          {current ? (
            <>
              <p className="mt-2 text-ink-2 text-xs">
                OFF のあいだ、このアカウントのブックマーク同期は走りません。
              </p>
              <p className="mt-2 text-ink-2 text-xs">
                {canUnbookmark
                  ? "アプリで削除した投稿は同期で戻りません。権限があるときは X のブックマークからも外します。"
                  : "アプリで削除した投稿は同期で戻りません。X からも外すには、下の「連携を更新」で許可を取り直してください。"}
              </p>
              <AccountSyncToggle
                id={current.id}
                enabled={current.syncEnabled}
              />
              <a
                href={`/api/x/oauth/start?next=/settings&reauth=1&hint=${encodeURIComponent(current.username)}`}
                className="mt-3 inline-block rounded-full border border-line px-4 py-2 text-sm"
              >
                @{current.username} の連携を更新
              </a>
              <p className="mt-2 text-ink-2 text-xs">
                押すと、いまの X
                ログインを一度切ってから、選んだアカウントの許可画面を開きます。
              </p>
              <DisconnectX id={current.id} />
            </>
          ) : (
            <p className="mt-2 text-ink-2 text-sm">
              上でアカウントを選ぶか、X と連携してください。
            </p>
          )}
        </section>
        <div className="mt-7 border-line border-t pt-7">
          <AccountTaxonomyCard
            key={current?.id ?? "none"}
            accountId={current?.id ?? null}
            initial={taxonomy}
          />
        </div>
      </article>
      <MediaUsageCard blobs={blobUsage} videos={videoUsage} />
      <VideoSaveFolderCard
        accountLabel={contextLabel(ctx)}
        initialFolderName={videoFolderName}
      />
      <MediaFoldersCard
        accounts={
          current ? [{ id: current.id, username: current.username }] : []
        }
      />
      <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">X API</h2>
          <span className="rounded-full bg-paper px-2 py-0.5 text-ink-2 text-xs">
            {health.x_api_enabled ? "有料ON" : "停止"}
          </span>
        </div>
        <p className="mt-2 text-ink-2 text-sm">
          全体トグルと、選んだアカウントの「同期（課金）」が両方 ON
          のときだけブックマークを取り込みます。自動は最短 6 時間。差分確認は 10
          件ずつです。急ぐときは「今すぐ同期」。
        </p>
        <XApiEnabledToggle enabled={health.x_api_enabled} />
        <ManualSyncButton
          disabled={!health.x_api_enabled || !current?.syncEnabled}
          hint="上で選んだアカウントの「同期（課金）」も ON にしてください。"
        />
        <SyncLimitsForm
          syncMaxPerRun={sync.syncMaxPerRun}
          mediaDownloadPerTick={sync.mediaDownloadPerTick}
        />
        <SettingsFlagToggle
          field="thread_expand_enabled"
          enabled={flags.threadExpandEnabled}
          label="セルフスレッド展開"
          hint="Reader で対象ごとに手動取得。$0.005/件。既定 OFF。"
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
        普段の動画保存は上の「保存フォルダ」で選びます。
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
