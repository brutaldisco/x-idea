import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ManualSyncButton } from "@/components/ManualSyncButton";
import { SourceCard } from "@/components/SourceCard";
import { listSources } from "@/server/sources/query";
import { getTodayState } from "@/server/today";
import { listXAccounts } from "@/server/x/account";
import { type AccountContext, contextLabel } from "@/server/x/context";

function formatRelative(iso: string | null): string {
  if (!iso) {
    return "未同期";
  }
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(delta / 60_000));
  if (minutes < 1) {
    return "たった今";
  }
  if (minutes < 60) {
    return `${minutes}分前`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}時間前`;
  }
  return `${Math.round(hours / 24)}日前`;
}

async function TodayBody() {
  await connection();
  const { empty, health, ctx } = await getTodayState();
  const accounts = await listXAccounts();
  const ctxLabel = ctx.kind === "account" ? `@${ctx.account.username}` : null;
  const scopeName = contextLabel(ctx);
  const canManual =
    health.x_api_enabled && accounts.some((account) => account.syncEnabled);
  const syncHint = health.x_api_enabled
    ? "Settings でアカウントの「同期（課金）」を ON にしてください。"
    : undefined;

  if (empty === "unlinked") {
    return (
      <section className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
        <p className="text-sm tracking-[0.2em] text-ink-2">MARGINALIA</p>
        <h1 className="mt-4 font-semibold text-3xl">余白に残す、知識。</h1>
        <p className="mt-3 max-w-sm text-ink-2">
          X のブックマークが、要約と分類と再浮上のあるライブラリになります。
        </p>
        <Link
          href="/onboarding"
          className="mt-10 rounded-full bg-ink px-6 py-3 font-medium text-paper"
        >
          X と連携して始める
        </Link>
      </section>
    );
  }

  if (empty === "needs_credits") {
    return (
      <section className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-ink-2">X 連携済み</p>
        <h2 className="mt-2 font-semibold text-2xl">
          クレジット設定が必要です
        </h2>
        <p className="mt-3 max-w-sm text-ink-2 text-sm">
          同期は Settings の「X API 同期」が OFF
          のあいだ動きません。クレジットを入れたあと、人間が ON にしてください。
        </p>
        <Link
          href="/settings"
          className="mt-8 rounded-full bg-ink px-6 py-3 font-medium text-paper"
        >
          設定を見る
        </Link>
      </section>
    );
  }

  if (empty === "importing") {
    return (
      <section className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-ink-2">{scopeName} の初回取り込み中…</p>
        <p className="mt-2 font-semibold text-2xl tabular-nums">
          準備しています
        </p>
        <p className="mt-3 text-ink-2 text-sm">
          自動同期は 6 時間以上あけます。急ぐときは今すぐ同期できます。
        </p>
        <ManualSyncButton
          disabled={!canManual}
          hint={syncHint}
          align="center"
        />
      </section>
    );
  }

  const budget = health.ai_budget.bulk;
  const budgetPct =
    budget.cap > 0 ? Math.round((budget.used / budget.cap) * 100) : 0;

  return (
    <section className="space-y-4 px-4 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/settings"
          className="min-w-0 flex-1 rounded-full border border-line bg-paper-2 px-4 py-2 text-center text-sm tabular-nums"
        >
          {ctxLabel ? `${ctxLabel} · ` : ""}最終同期{" "}
          {formatRelative(health.last_synced_at)} · AI 処理待ち{" "}
          {health.pending_jobs} · 予算 {budgetPct}%
        </Link>
        <ManualSyncButton
          disabled={!canManual}
          hint={syncHint}
          className="shrink-0"
        />
      </div>
      <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-5 shadow-[var(--shadow-card)]">
        <p className="text-ink-2 text-xs">Briefing</p>
        <h2 className="mt-1 font-semibold text-lg">
          昨日の新着はまだありません
        </h2>
        <p className="mt-2 text-ink-2 text-sm">毎朝 7:00 に生成予定です。</p>
      </article>
      {health.inbox_count > 0 ? (
        <Link
          href="/inbox"
          className="block rounded-full bg-ai-soft px-4 py-2 text-ai text-sm"
        >
          要確認 {health.inbox_count}件 →
        </Link>
      ) : null}
      <RecentSources ctx={ctx} label={scopeName} />
      <article className="rounded-[var(--radius-card)] border border-dashed border-line p-5 text-ink-2 text-sm">
        Echo と Insights は次のフェーズで開きます。
      </article>
    </section>
  );
}

async function RecentSources({
  ctx,
  label,
}: {
  ctx: AccountContext;
  label: string;
}) {
  const items = await listSources({ ctx, limit: 8 });
  if (items.length === 0) {
    return (
      <article className="rounded-[var(--radius-card)] border border-dashed border-line p-5 text-ink-2 text-sm">
        {label}の最近の Source はまだありません。
      </article>
    );
  }
  return (
    <section>
      <p className="mb-2 text-ink-2 text-xs">
        最近の Source · {label} · 新しい順
      </p>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {items.map((item) => (
          <SourceCard
            key={item.id}
            id={item.id}
            authorUsername={item.authorUsername}
            summary={item.summary}
            url={item.url}
            mediaId={item.mediaId}
            mediaType={item.mediaType}
            lang={item.lang}
            summaryFromAi={item.summaryFromAi}
            postedAt={item.postedAt}
            variant="rail"
          />
        ))}
      </ul>
    </section>
  );
}

export default function TodayPage() {
  return (
    <>
      <header className="px-4 pt-8">
        <p className="text-ink-2 text-sm">Today</p>
        <h1 className="font-semibold text-2xl">今日の余白</h1>
      </header>
      <Suspense
        fallback={<p className="px-4 pt-10 text-ink-2 text-sm">読み込み中…</p>}
      >
        <TodayBody />
      </Suspense>
    </>
  );
}
