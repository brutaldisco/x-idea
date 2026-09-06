export const PWA_CACHE_VERSION = "marginalia-v1";
export const PWA_READER_CACHE_LIMIT = 100;
export const PWA_SOURCES_CACHE_LIMIT = 200;
export const PWA_SOURCES_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const PWA_NAME = "Marginalia";
export const PWA_SHORT_NAME = "Marginalia";
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

export function safeInternalPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return PWA_START_URL;
  }
  return next;
}
