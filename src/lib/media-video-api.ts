export function mediaVideoUrlApiPath(mediaId: string): string {
  return `/api/media/${encodeURIComponent(mediaId)}/url`;
}

export function mediaVideoRedirectPath(mediaId: string): string {
  return `${mediaVideoUrlApiPath(mediaId)}?redirect=1`;
}

export function mediaVideoProxyPath(
  mediaId: string,
  options?: { inline?: boolean },
): string {
  const base = `/api/media/${encodeURIComponent(mediaId)}/file`;
  return options?.inline ? `${base}?inline=1` : base;
}

export type VideoSourcePayload = {
  url: string;
  bytes: number | null;
};

export function parseVideoSourcePayload(
  value: unknown,
): VideoSourcePayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const url = (value as { url?: unknown }).url;
  if (typeof url !== "string" || url.length === 0) {
    return null;
  }
  const raw = (value as { bytes?: unknown }).bytes;
  const bytes =
    typeof raw === "number" && Number.isFinite(raw) && raw > 0
      ? Math.floor(raw)
      : null;
  return { url, bytes };
}

/** CDN リダイレクト再生が失敗したときのプロキシ再生 URL */
export function mediaVideoProxyFallbackPath(url: string): string | null {
  const match = url.match(/^\/api\/media\/([^/?#]+)\/url(?:\?|$)/);
  if (!match) {
    return null;
  }
  try {
    return mediaVideoProxyPath(decodeURIComponent(match[1]), { inline: true });
  } catch {
    return null;
  }
}
