import { videoBadgeCopy } from "@/lib/video-badge";
import { formatDuration } from "@/server/media/select";

export function VideoThumbMarks({
  mediaType,
  saveStatus,
  durationMs,
  className = "right-1 bottom-1",
}: {
  mediaType?: string | null;
  saveStatus?: string | null;
  durationMs?: number | null;
  className?: string;
}) {
  if (!mediaType || mediaType === "photo") {
    return null;
  }
  const copy = videoBadgeCopy(saveStatus);
  const label = durationMs != null ? formatDuration(durationMs).label : null;
  const bullet =
    copy.tone === "saved"
      ? "bg-ok"
      : copy.tone === "pending"
        ? "bg-warn"
        : null;
  if (!label && !bullet) {
    return null;
  }
  return (
    <span
      title={bullet ? copy.title : undefined}
      className={`absolute flex items-center gap-1 rounded bg-ink/80 px-1 text-[10px] text-paper ${className}`}
    >
      {bullet ? (
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${bullet}`} />
      ) : null}
      {label ? <span className="tabular-nums">{label}</span> : null}
    </span>
  );
}
