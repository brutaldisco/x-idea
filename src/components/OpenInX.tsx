export function OpenInX({
  url,
  compact = false,
}: {
  url: string;
  compact?: boolean;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={
        compact
          ? "text-accent text-xs underline-offset-2 hover:underline"
          : "inline-flex items-center rounded-full border border-line px-3 py-1.5 text-sm hover:bg-paper-2"
      }
    >
      X で開く
    </a>
  );
}
