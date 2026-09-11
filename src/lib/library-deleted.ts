const KEY = "x-idea.library.deleted.v1";
const LIMIT = 200;

export function readDeletedSourceIds(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.map((item) => String(item)) : [],
    );
  } catch {
    return new Set();
  }
}

export function rememberDeletedSource(sourceId: string): void {
  if (typeof window === "undefined" || !sourceId) {
    return;
  }
  const ids = readDeletedSourceIds();
  ids.add(sourceId);
  window.localStorage.setItem(KEY, JSON.stringify([...ids].slice(-LIMIT)));
}

export function isDeletedSourceId(sourceId: string): boolean {
  return readDeletedSourceIds().has(sourceId);
}
