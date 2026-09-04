import type { XMedia, XMediaVariant } from "@/server/x/parse";

export const LONG_VIDEO_MS = 14_400_000;
export const MIN_FREE_BYTES = 1024 * 1024 * 1024;

export function parseVariantsJson(
  raw: string | null | undefined,
): XMediaVariant[] {
  if (!raw) {
    return [];
  }
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const row = item as Record<string, unknown>;
      if (typeof row.url !== "string") {
        return [];
      }
      return [
        {
          url: row.url,
          bit_rate: typeof row.bit_rate === "number" ? row.bit_rate : undefined,
          content_type:
            typeof row.content_type === "string" ? row.content_type : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function pickBestMp4Url(variants: XMediaVariant[]): string | null {
  const mp4 = variants.filter(
    (item) =>
      item.url &&
      (item.content_type === "video/mp4" || item.url.includes(".mp4")),
  );
  if (mp4.length === 0) {
    return null;
  }
  mp4.sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0));
  return mp4[0]?.url ?? null;
}

export function originalImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("name", "orig");
    return parsed.toString();
  } catch {
    return url.includes("?") ? `${url}&name=orig` : `${url}?name=orig`;
  }
}

export function downloadUrlFor(media: {
  type: string;
  media_url?: string | null;
  variants?: XMediaVariant[];
}): string | null {
  if (media.type === "photo") {
    return media.media_url ? originalImageUrl(media.media_url) : null;
  }
  return pickBestMp4Url(media.variants ?? []) ?? media.media_url ?? null;
}

export function extensionFor(media: {
  type: string;
  url: string | null;
}): string {
  if (media.type === "photo") {
    const match = media.url?.match(/\.(jpe?g|png|webp|gif)(?:$|\?)/i);
    return match ? `.${match[1].toLowerCase().replace("jpeg", "jpg")}` : ".jpg";
  }
  return ".mp4";
}

export function isLongVideo(
  type: string,
  durationMs: number | null | undefined,
): boolean {
  return (
    (type === "video" || type === "animated_gif") &&
    typeof durationMs === "number" &&
    durationMs > LONG_VIDEO_MS
  );
}

export function formatDuration(durationMs: number): {
  hours: number;
  minutes: number;
  label: string;
} {
  const totalMin = Math.max(0, Math.round(durationMs / 60_000));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return {
    hours,
    minutes,
    label: hours > 0 ? `${hours}時間 ${minutes}分` : `${minutes}分`,
  };
}

export function contentTypeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return "video/mp4";
    default:
      return "image/jpeg";
  }
}

export function initialDownloadStatus(media: XMedia): string {
  return isLongVideo(media.type, media.duration_ms)
    ? "awaiting_confirm"
    : "pending";
}
