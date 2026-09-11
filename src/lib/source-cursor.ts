import { type SourceSort, VIDEO_SAVED_SORT_KEY_SQL } from "@/lib/source-sort";

export const SOURCE_PAGE_SIZE = 60;
export const SOURCE_PAGE_MAX = 100;
export const SOURCE_PAGE_INDEX_MAX = 1000;

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

export function clampSourcePage(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return 1;
  }
  return Math.min(SOURCE_PAGE_INDEX_MAX, Math.max(1, Math.floor(n)));
}

export function sourcePageOffset(
  page: number,
  limit = SOURCE_PAGE_SIZE,
): number {
  return (Math.max(1, page) - 1) * Math.max(1, limit);
}

export function sourcePageCount(
  total: number,
  pageSize = SOURCE_PAGE_SIZE,
): number {
  if (total <= 0) {
    return 1;
  }
  return Math.ceil(total / pageSize);
}

export function withLibraryPage(search: string, page: number): string {
  const next = new URLSearchParams(search);
  if (page <= 1) {
    next.delete("page");
  } else {
    next.set("page", String(page));
  }
  return next.toString();
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
  if (sort === "video_saved") {
    return VIDEO_SAVED_SORT_KEY_SQL;
  }
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
  item: {
    postedAt: string | null;
    savedAt: string;
    videoSaveStatus?: string | null;
  },
  sort: SourceSort,
): string {
  if (sort === "video_saved") {
    const ready = item.videoSaveStatus === "ready" ? "1" : "0";
    return `${ready}|${item.postedAt ?? item.savedAt}`;
  }
  if (sort.startsWith("saved_")) {
    return item.savedAt;
  }
  return item.postedAt ?? item.savedAt;
}
