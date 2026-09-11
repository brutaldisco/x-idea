export const PWA_CACHE_VERSION = "x-idea-v6";
export const PWA_ICON_REVISION = "xi";
export const PWA_APPLE_TOUCH_ICON = "/apple-touch-icon-xi.png";

export function pwaIconSrc(path: string): string {
  return `${path}?v=${PWA_ICON_REVISION}`;
}
export const PWA_READER_CACHE_LIMIT = 100;
export const PWA_SOURCES_CACHE_LIMIT = 200;
export const PWA_SOURCES_MAX_AGE_MS = 10 * 60 * 1000;
export const PWA_RUNTIME_NAV_LIMIT = 30;
export const PWA_CLEAR_SOURCES_MESSAGE = "clear-sources";

export const PWA_NAME = "x-idea";
export const PWA_SHORT_NAME = "x-idea";
export const PWA_DESCRIPTION = "X ブックマークのパーソナルナレッジベース";
export const PWA_START_URL = "/today";
export const PWA_OFFLINE_PATH = "/offline";
export const PWA_SW_PATH = "/sw.js";
export const PWA_THEME_COLOR = "#2A3040";
export const PWA_BACKGROUND_COLOR = "#F6F3EB";
export const PWA_BACKGROUND_COLOR_DARK = "#1A2030";

export function isPwaPublicPath(pathname: string): boolean {
  return (
    pathname === PWA_SW_PATH ||
    pathname === PWA_OFFLINE_PATH ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icons/") ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/apple-touch-icon-xi.png" ||
    pathname === "/icon" ||
    pathname.startsWith("/icon/") ||
    pathname === "/apple-icon" ||
    pathname.startsWith("/apple-icon/")
  );
}

export function shouldBypassServiceWorker(
  pathname: string,
  method: string,
): boolean {
  if (method !== "GET") {
    return true;
  }
  if (pathname.startsWith("/api/media/") && pathname.includes("/file")) {
    return true;
  }
  if (pathname.startsWith("/api/videos")) {
    return true;
  }
  if (pathname.startsWith("/api/jobs")) {
    return true;
  }
  if (pathname.startsWith("/api/sync")) {
    return true;
  }
  if (pathname.startsWith("/api/x/")) {
    return true;
  }
  if (pathname.startsWith("/api/auth/")) {
    return true;
  }
  if (pathname.startsWith("/api/mcp")) {
    return true;
  }
  if (pathname.startsWith("/_next/webpack")) {
    return true;
  }
  return false;
}

export function isSourcesApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/sources");
}

export function isReaderPath(pathname: string): boolean {
  return pathname.startsWith("/source/");
}

export function isStaticAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/static/") || pathname.startsWith("/icons/")
  );
}

export function isMediaThumbPath(pathname: string): boolean {
  return pathname.startsWith("/api/media/") && !pathname.includes("/file");
}

export function isHttpDateFresh(
  dateHeader: string | null,
  maxAgeMs: number,
  now = Date.now(),
): boolean {
  if (!dateHeader) {
    return false;
  }
  const time = Date.parse(dateHeader);
  return Number.isFinite(time) && now - time < maxAgeMs;
}

export function sourcesCacheName(): string {
  return `${PWA_CACHE_VERSION}-sources`;
}

export async function clearSourcesHttpCache(): Promise<void> {
  if (typeof caches !== "undefined") {
    try {
      await caches.delete(sourcesCacheName());
    } catch {
      return;
    }
  }
  if (typeof navigator !== "undefined") {
    navigator.serviceWorker?.controller?.postMessage(PWA_CLEAR_SOURCES_MESSAGE);
  }
}

export function safeInternalPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return PWA_START_URL;
  }
  return next;
}
