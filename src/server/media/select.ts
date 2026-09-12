import { formatBytes } from "@/lib/bytes";
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

export function pickBestMp4(variants: XMediaVariant[]): XMediaVariant | null {
  const mp4 = variants.filter(
    (item) =>
      item.url &&
      (item.content_type === "video/mp4" || item.url.includes(".mp4")),
  );
  if (mp4.length === 0) {
    return null;
  }
  mp4.sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0));
  return mp4[0] ?? null;
}

export function pickBestMp4Url(variants: XMediaVariant[]): string | null {
  return pickBestMp4(variants)?.url ?? null;
}

export function parseVariantSize(
  url: string,
): { width: number; height: number } | null {
  const match = url.match(/(?:^|[^\d])(\d{2,4})x(\d{2,4})(?:[^\d]|$)/);
  if (!match) {
    return null;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) {
    return null;
  }
  return { width, height };
}

export function formatVideoQuality(
  width: number | null | undefined,
  height: number | null | undefined,
): string | null {
  if (!width || !height || width <= 0 || height <= 0) {
    return null;
  }
  const short = Math.min(width, height);
  if (short >= 1080) {
    return "1080p";
  }
  if (short >= 720) {
    return "720p";
  }
  if (short >= 480) {
    return "480p";
  }
  if (short >= 360) {
    return "360p";
  }
  if (short >= 240) {
    return "240p";
  }
  return `${short}p`;
}

export function estimateMp4Bytes(
  bitRate: number | null | undefined,
  durationMs: number | null | undefined,
): number | null {
  if (
    typeof bitRate !== "number" ||
    bitRate <= 0 ||
    typeof durationMs !== "number" ||
    durationMs <= 0
  ) {
    return null;
  }
  return Math.round((bitRate / 8) * (durationMs / 1000));
}

export function videoVariantMeta(input: {
  variants: XMediaVariant[];
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}): { qualityLabel: string | null; estimatedBytes: number | null } {
  const best = pickBestMp4(input.variants);
  const fromUrl = best?.url ? parseVariantSize(best.url) : null;
  return {
    qualityLabel: formatVideoQuality(
      fromUrl?.width ?? input.width,
      fromUrl?.height ?? input.height,
    ),
    estimatedBytes: estimateMp4Bytes(best?.bit_rate, input.durationMs),
  };
}

export function formatVideoQueueMeta(input: {
  bytes?: number | null;
  estimatedBytes?: number | null;
  qualityLabel?: string | null;
  progressTotal?: number | null;
}): string | null {
  const actual =
    input.bytes && input.bytes > 0
      ? input.bytes
      : input.progressTotal && input.progressTotal > 0
        ? input.progressTotal
        : null;
  const size = actual
    ? formatBytes(actual)
    : input.estimatedBytes && input.estimatedBytes > 0
      ? `約 ${formatBytes(input.estimatedBytes)}`
      : null;
  const parts = [size, input.qualityLabel ?? null].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" · ") : null;
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

export function previewUrlFor(media: {
  type: string;
  media_url?: string | null;
  preview_url?: string | null;
}): string | null {
  if (media.preview_url) {
    return media.preview_url;
  }
  if (media.type === "photo" && media.media_url) {
    return media.media_url;
  }
  return null;
}

export function remoteUrlFor(media: {
  type: string;
  media_url?: string | null;
  preview_url?: string | null;
  variants?: XMediaVariant[];
  previewOnly?: boolean;
}): string | null {
  if (media.previewOnly) {
    return previewUrlFor(media);
  }
  return downloadUrlFor(media) ?? previewUrlFor(media);
}

export function needsTweetRefresh(media: {
  type: string;
  media_url?: string | null;
  variants?: XMediaVariant[];
  variants_json?: string | null;
}): boolean {
  if (media.type === "photo") {
    return !media.media_url;
  }
  return (
    media.variants_json == null && pickBestMp4Url(media.variants ?? []) == null
  );
}

export function extensionFor(_media: {
  type: string;
  url: string | null;
}): string {
  return ".webp";
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
  const totalSec = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const hours = Math.floor(minutes / 60);
  return {
    hours,
    minutes: minutes % 60,
    label: `${minutes}:${seconds.toString().padStart(2, "0")}`,
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

export function initialDownloadStatus(_media: XMedia): string {
  return "pending";
}
