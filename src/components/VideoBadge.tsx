import { QueueBadge } from "@/components/QueueBadge";
import { SavedBadge } from "@/components/SavedBadge";
import { type VideoBadgeTone, videoBadgeCopy } from "@/lib/video-badge";

const TONE_CLASS: Record<
  Exclude<VideoBadgeTone, "saved" | "pending">,
  string
> = {
  video: "bg-ink/80 text-paper",
};

export function VideoBadge({
  saveStatus,
  compact = true,
  className = "right-1 bottom-1",
}: {
  saveStatus?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const copy = videoBadgeCopy(saveStatus);
  const position = `absolute ${className}`;
  if (copy.tone === "saved") {
    return <SavedBadge compact={compact} className={position} />;
  }
  if (copy.tone === "pending") {
    return <QueueBadge compact={compact} className={position} />;
  }
  return (
    <span
      title={copy.title}
      className={`${position} rounded px-1 ${
        compact ? "text-[10px]" : "px-2 py-0.5 text-xs"
      } ${TONE_CLASS[copy.tone]}`}
    >
      {copy.label}
    </span>
  );
}
