export function AccountSyncDot({
  enabled,
  inverted = false,
}: {
  enabled: boolean;
  inverted?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={enabled ? "同期ON" : "同期OFF"}
      title={enabled ? "同期ON" : "同期OFF"}
      className={`ml-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
        enabled
          ? "bg-ok"
          : inverted
            ? "border border-paper/70"
            : "border border-ink-2"
      }`}
    />
  );
}
