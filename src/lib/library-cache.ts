import {
  defaultShouldDehydrateQuery,
  type InfiniteData,
  type Query,
  type QueryClient,
} from "@tanstack/react-query";
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
  return (
    query.queryKey[0] === LIBRARY_SOURCES_KEY &&
    defaultShouldDehydrateQuery(query)
  );
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
