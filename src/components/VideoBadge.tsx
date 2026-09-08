import { type VideoBadgeTone, videoBadgeCopy } from "@/lib/video-badge";

const TONE_CLASS: Record<VideoBadgeTone, string> = {
  saved: "bg-ok text-paper",
  pending: "bg-warn text-ink",
  video: "bg-ink/80 text-paper",
};

export function VideoBadge({
  saveStatus,
  compact = true,
}: {
  saveStatus?: string | null;
  compact?: boolean;
}) {
  const copy = videoBadgeCopy(saveStatus);
  return (
    <span
      title={copy.title}
      className={`absolute right-1 bottom-1 rounded px-1 ${
        compact ? "text-[10px]" : "px-2 py-0.5 text-xs"
      } ${TONE_CLASS[copy.tone]}`}
    >
      {copy.label}
    </span>
  );
}
