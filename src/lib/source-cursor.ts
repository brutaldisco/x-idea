import type { SourceSort } from "@/lib/source-sort";

export const SOURCE_PAGE_SIZE = 30;
export const SOURCE_PAGE_MAX = 100;

export type SourceCursor = {
  key: string;
  id: string;
};

export function clampSourceLimit(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return SOURCE_PAGE_SIZE;
  }
  return Math.min(SOURCE_PAGE_MAX, Math.max(1, Math.floor(n)));
}

export function encodeSourceCursor(key: string, id: string): string {
  return `${encodeURIComponent(key)}|${encodeURIComponent(id)}`;
}

export function decodeSourceCursor(
  raw: string | null | undefined,
): SourceCursor | null {
  if (!raw) {
    return null;
  }
  const sep = raw.indexOf("|");
  if (sep <= 0) {
    return null;
  }
  try {
    const key = decodeURIComponent(raw.slice(0, sep)).trim();
    const id = decodeURIComponent(raw.slice(sep + 1)).trim();
    if (!key || !id || id.length > 48) {
      return null;
    }
    return { key, id };
  } catch {
    return null;
  }
}

export function sourceSortKeySql(sort: SourceSort): string {
  return sort.startsWith("saved_")
    ? "s.saved_at"
    : "COALESCE(p.posted_at, s.bookmarked_at, s.saved_at)";
}

export function sourceCursorSql(sort: SourceSort): string {
  const key = sourceSortKeySql(sort);
  const cmp = sort.endsWith("_asc") ? ">" : "<";
  return `(${key} ${cmp} ? OR (${key} = ? AND s.id ${cmp} ?))`;
}

export function sourceCursorKey(
  item: { postedAt: string | null; savedAt: string },
  sort: SourceSort,
): string {
  if (sort.startsWith("saved_")) {
    return item.savedAt;
  }
  return item.postedAt ?? item.savedAt;
}
