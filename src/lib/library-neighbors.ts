const STORAGE_KEY = "x-idea.library.neighbors";

export const EMPTY_LIBRARY_NEIGHBORS: string[] = [];

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedIds: string[] = EMPTY_LIBRARY_NEIGHBORS;

export function parseLibraryNeighbors(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as { ids?: unknown };
    if (!Array.isArray(parsed.ids)) {
      return [];
    }
    return parsed.ids.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
  } catch {
    return [];
  }
}

export function neighborsAround(
  ids: string[],
  currentId: string,
): { prevId: string | null; nextId: string | null } {
  const index = ids.indexOf(currentId);
  if (index < 0) {
    return { prevId: null, nextId: null };
  }
  return {
    prevId: ids[index - 1] ?? null,
    nextId: ids[index + 1] ?? null,
  };
}

function storageGet(): string | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function emitLibraryNeighbors(): void {
  cachedRaw = undefined;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeLibraryNeighbors(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readLibraryNeighbors(): string[] {
  const raw = storageGet();
  if (raw === cachedRaw) {
    return cachedIds;
  }
  cachedRaw = raw;
  const ids = parseLibraryNeighbors(raw);
  cachedIds = ids.length === 0 ? EMPTY_LIBRARY_NEIGHBORS : ids;
  return cachedIds;
}

export function getLibraryNeighborsServerSnapshot(): string[] {
  return EMPTY_LIBRARY_NEIGHBORS;
}

export function writeLibraryNeighbors(ids: string[]): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ids }));
    emitLibraryNeighbors();
  } catch {
    return;
  }
}
