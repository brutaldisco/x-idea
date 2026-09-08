const STORAGE_KEY = "marginalia.library.scroll";

export function libraryScrollKey(input: {
  sort: string;
  filters: string;
  view: string;
}): string {
  return `${input.sort}|${input.filters}|${input.view}`;
}

export function parseLibraryScroll(
  raw: string | null,
  key: string,
): number | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { key?: unknown; y?: unknown };
    if (parsed.key !== key || typeof parsed.y !== "number") {
      return null;
    }
    if (!Number.isFinite(parsed.y)) {
      return null;
    }
    return Math.max(0, parsed.y);
  } catch {
    return null;
  }
}

export function canRestoreLibraryScroll(
  y: number,
  scrollHeight: number,
  viewportHeight: number,
): boolean {
  return y <= Math.max(0, scrollHeight - viewportHeight) + 80;
}

export function readLibraryScroll(key: string): number | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  try {
    return parseLibraryScroll(sessionStorage.getItem(STORAGE_KEY), key);
  } catch {
    return null;
  }
}

export function writeLibraryScroll(key: string, y: number): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ key, y: Math.max(0, y) }),
  );
}
