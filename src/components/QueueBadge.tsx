import { videoBadgeCopy } from "@/lib/video-badge";

export function QueueBadge({
  compact = true,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const copy = videoBadgeCopy("queued");
  return (
    <span
      title={copy.title}
      className={`rounded border border-warn bg-paper font-medium text-warn ${
        compact ? "px-1 text-[10px]" : "px-2 py-0.5 text-xs"
      } ${className ?? ""}`}
    >
      {copy.label}
    </span>
  );
}
