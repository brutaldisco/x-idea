export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(value);
}

export function RemainRing({
  ratio,
  low,
  label,
}: {
  ratio: number | null;
  low: boolean;
  label: string;
}) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const fill = ratio == null ? 0 : ratio;
  const color = low ? "var(--color-danger)" : "var(--color-ok)";
  return (
    <svg
      viewBox="0 0 96 96"
      className="h-24 w-24 shrink-0"
      role="img"
      aria-label={label}
    >
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth="8"
      />
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fill)}
        transform="rotate(-90 48 48)"
      />
    </svg>
  );
}

export function DayBars({
  values,
  labels,
  color = "var(--color-accent)",
}: {
  values: number[];
  labels: string[];
  color?: string;
}) {
  const max = Math.max(...values, 0.0001);
  return (
    <div>
      <div
        className="flex h-20 items-end gap-0.5"
        role="img"
        aria-label="日次の使用量"
      >
        {values.map((value, index) => {
          const height = Math.max(4, (value / max) * 100);
          return (
            <div
              key={labels[index] ?? `day-${value}`}
              className="flex h-full min-w-0 flex-1 items-end"
              title={`${labels[index]}: ${value}`}
            >
              <div
                className="w-full rounded-t-sm"
                style={{
                  height: `${height}%`,
                  background: value > 0 ? color : "var(--color-line)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-0.5">
        {labels.map((label, index) => (
          <span
            key={label}
            className="min-w-0 flex-1 text-center text-[10px] text-ink-2"
          >
            {index % 2 === 0 || index === labels.length - 1
              ? label.slice(5)
              : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RemainBar({
  remaining,
  cap,
  label,
}: {
  remaining: number;
  cap: number;
  label: string;
}) {
  const ratio = cap > 0 ? remaining / cap : 0;
  const low = ratio <= 0.15;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className={low ? "text-danger" : "text-ink-2"}>
          残り {remaining} / {cap}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full ${low ? "bg-danger" : "bg-ok"}`}
          style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
        />
      </div>
    </div>
  );
}

export function AccountBars({
  accounts,
}: {
  accounts: { username: string; resources: number; costUsd: number }[];
}) {
  const max = Math.max(...accounts.map((row) => row.costUsd), 0.0001);
  if (accounts.length === 0) {
    return (
      <p className="text-ink-2 text-sm">まだアカウント別の使用はありません。</p>
    );
  }
  return (
    <ul className="space-y-2">
      {accounts.map((row) => (
        <li key={`${row.username}-${row.resources}`}>
          <div className="flex items-baseline justify-between text-sm">
            <span>{row.username}</span>
            <span className="text-ink-2 text-xs">
              {formatUsd(row.costUsd)} · {row.resources.toLocaleString("ja-JP")}{" "}
              件
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min(100, (row.costUsd / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
