import {
  defaultShouldDehydrateQuery,
  type InfiniteData,
  type Query,
  type QueryClient,
} from "@tanstack/react-query";
import { SOURCE_PAGE_SIZE } from "@/lib/source-cursor";
import type { LibraryFilters } from "@/lib/source-filters";
import type { SourceSort } from "@/lib/source-sort";

export const LIBRARY_SOURCES_KEY = "sources";
export const LIBRARY_STALE_MS = 5 * 60_000;

export function libraryFilterKey(filters: LibraryFilters): string {
  return JSON.stringify(filters);
}

export function libraryQueryKey(sort: SourceSort, filterKey: string) {
  return [LIBRARY_SOURCES_KEY, sort, filterKey] as const;
}

export function shouldPersistLibraryQuery(query: Query): boolean {
  if (
    query.queryKey[0] !== LIBRARY_SOURCES_KEY ||
    !defaultShouldDehydrateQuery(query)
  ) {
    return false;
  }
  const data = query.state.data;
  return !isLibrarySourcesData(data) || !libraryListInconsistent(data);
}

export type LibrarySourcesPage = {
  items: Array<{ id: string }>;
  nextCursor: string | null;
  count: number | null;
};

export function isLibrarySourcesData(
  value: unknown,
): value is InfiniteData<LibrarySourcesPage> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const pages = (value as InfiniteData<LibrarySourcesPage>).pages;
  return Array.isArray(pages);
}

export function libraryLoadedCount(
  data: InfiniteData<LibrarySourcesPage> | undefined,
): number {
  return data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? 0;
}

export function libraryReportedCount(
  data: InfiniteData<LibrarySourcesPage> | undefined,
): number | null {
  const count = data?.pages[0]?.count;
  return typeof count === "number" && Number.isFinite(count) ? count : null;
}

/** 件数はあるのに nextCursor が切れて続きを取れない（壊れた persist など）。 */
export function libraryListInconsistent(
  data: InfiniteData<LibrarySourcesPage> | undefined,
): boolean {
  if (!data?.pages.length) {
    return false;
  }
  const total = libraryReportedCount(data);
  if (total == null) {
    return false;
  }
  const loaded = libraryLoadedCount(data);
  const last = data.pages[data.pages.length - 1];
  return loaded < total && !last?.nextCursor;
}

/** 最終ページが1ページ分に満たず、まだ続きがある。 */
export function libraryListNeedsMore(
  data: InfiniteData<LibrarySourcesPage> | undefined,
): boolean {
  if (!data?.pages.length) {
    return false;
  }
  const total = libraryReportedCount(data);
  if (total == null) {
    return false;
  }
  const last = data.pages[data.pages.length - 1];
  return (
    libraryLoadedCount(data) < total &&
    Boolean(last?.nextCursor) &&
    last.items.length < SOURCE_PAGE_SIZE
  );
}

export function removeSourceFromLibraryPages(
  data: InfiniteData<LibrarySourcesPage>,
  sourceId: string,
): InfiniteData<LibrarySourcesPage> {
  let removed = 0;
  const pages = data.pages.map((page) => {
    const items = page.items.filter((item) => {
      if (item.id !== sourceId) {
        return true;
      }
      removed += 1;
      return false;
    });
    return items.length === page.items.length ? page : { ...page, items };
  });
  if (removed === 0) {
    return data;
  }
  return {
    ...data,
    pages: pages.map((page, index) => {
      if (index !== 0 || page.count == null) {
        return page;
      }
      return { ...page, count: Math.max(0, page.count - removed) };
    }),
  };
}

export function removeSourceFromLibraryQueries(
  client: QueryClient,
  sourceId: string,
): void {
  client.setQueriesData({ queryKey: [LIBRARY_SOURCES_KEY] }, (old) => {
    if (!isLibrarySourcesData(old)) {
      return old;
    }
    return removeSourceFromLibraryPages(old, sourceId);
  });
}

export function resetLibraryQueries(client: QueryClient): void {
  client.removeQueries({ queryKey: [LIBRARY_SOURCES_KEY] });
}
