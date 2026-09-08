import { videoBadgeCopy } from "@/lib/video-badge";

export function SavedBadge({
  compact = true,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const copy = videoBadgeCopy("ready");
  return (
    <span
      title={copy.title}
      className={`rounded border border-ok bg-paper font-medium text-ok ${
        compact ? "px-1 text-[10px]" : "px-2 py-0.5 text-xs"
      } ${className ?? ""}`}
    >
      {copy.label}
    </span>
  );
}
