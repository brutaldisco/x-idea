import {
  CreditLedgerForm,
  UsageRefreshButton,
} from "@/components/CreditLedgerForm";
import {
  AccountBars,
  DayBars,
  formatUsd,
  RemainBar,
  RemainRing,
} from "@/components/UsageCharts";
import type { UsageDashboard } from "@/server/usage/dashboard";

const SOURCE_LABEL = {
  live: "X の残量",
  snapshot: "コンソール残量からの見積もり",
  purchased: "追加記録からの見積もり",
  unknown: "まだ残量を記録していません",
} as const;

const LANE_LABEL = {
  bulk: "一括（Flash-Lite）",
  quality: "品質（Flash）",
  embed: "埋め込み",
} as const;

export function UsageMeters({ data }: { data: UsageDashboard }) {
  const remainLabel =
    data.x.remainingUsd == null
      ? "残量未設定"
      : `残り ${formatUsd(data.x.remainingUsd)}`;
  return (
    <div className="space-y-3">
      <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">X API クレジット</h2>
            <p className="text-ink-2 text-xs">{SOURCE_LABEL[data.x.source]}</p>
          </div>
          <UsageRefreshButton />
        </div>
        <div className="mt-3 flex items-center gap-4">
          <RemainRing
            ratio={data.x.ratio}
            low={data.x.low}
            label={remainLabel}
          />
          <div>
            <p className="font-semibold text-2xl tabular-nums">{remainLabel}</p>
            <p className="mt-1 text-ink-2 text-sm">
              推定使用 {formatUsd(data.x.usedUsd)} ·{" "}
              {data.x.usedResources.toLocaleString("ja-JP")} 件
            </p>
            {data.x.purchasedUsd > 0 ? (
              <p className="text-ink-2 text-xs">
                追加合計 {formatUsd(data.x.purchasedUsd)}
              </p>
            ) : null}
          </div>
        </div>
        {data.x.low ? (
          <p className="mt-3 rounded-xl bg-warn/20 px-3 py-2 text-sm">
            残量が少なくなっています。Developer Console で追加してください。
          </p>
        ) : null}
        {data.x.source === "unknown" ? (
          <p className="mt-3 text-ink-2 text-sm">
            購入した額か、コンソールに出ている残量を記録すると、減り方が分かります。
          </p>
        ) : null}
        {data.x.liveError ? (
          <p className="mt-2 text-ink-2 text-xs">{data.x.liveError}</p>
        ) : null}
        <h3 className="mt-5 font-medium text-sm">日次の使用量（推定）</h3>
        <div className="mt-2">
          <DayBars
            values={data.x.daily.map((row) => row.costUsd)}
            labels={data.x.daily.map((row) => row.date)}
          />
        </div>
        <h3 className="mt-5 font-medium text-sm">アカウント別</h3>
        <div className="mt-2">
          <AccountBars
            accounts={data.x.accounts.map((row) => ({
              username: row.id ? `@${row.username}` : row.username,
              resources: row.resources,
              costUsd: row.costUsd,
            }))}
          />
        </div>
        <CreditLedgerForm />
      </article>

      <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
        <h2 className="font-semibold">Gemini API</h2>
        <p className="text-ink-2 text-xs">{data.ai.resetHint}</p>
        <div className="mt-3 space-y-3">
          {data.ai.lanes.map((lane) => (
            <RemainBar
              key={lane.lane}
              remaining={lane.remaining}
              cap={lane.cap}
              label={LANE_LABEL[lane.lane]}
            />
          ))}
        </div>
        <h3 className="mt-5 font-medium text-sm">日次リクエスト</h3>
        <div className="mt-2">
          <DayBars
            values={data.ai.daily.map(
              (row) => row.bulk + row.quality + row.embed,
            )}
            labels={data.ai.daily.map((row) => row.date)}
            color="var(--color-ai)"
          />
        </div>
      </article>
    </div>
  );
}
