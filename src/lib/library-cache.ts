import {
  defaultShouldDehydrateQuery,
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

export function libraryQueryKey(sort: SourceSort, filterKey: string, page = 1) {
  return [LIBRARY_SOURCES_KEY, sort, filterKey, page] as const;
}

export function shouldPersistLibraryQuery(query: Query): boolean {
  if (
    query.queryKey[0] !== LIBRARY_SOURCES_KEY ||
    !defaultShouldDehydrateQuery(query)
  ) {
    return false;
  }
  return isLibrarySourcesData(query.state.data);
}

export type LibrarySourcesPage = {
  items: Array<{ id: string }>;
  nextCursor: string | null;
  count: number | null;
};

export function isLibrarySourcesData(
  value: unknown,
): value is LibrarySourcesPage {
  if (!value || typeof value !== "object") {
    return false;
  }
  return Array.isArray((value as LibrarySourcesPage).items);
}

export function removeSourceFromLibraryPage(
  data: LibrarySourcesPage,
  sourceId: string,
): LibrarySourcesPage {
  const items = data.items.filter((item) => item.id !== sourceId);
  if (items.length === data.items.length) {
    return data;
  }
  return {
    ...data,
    items,
    count: data.count == null ? null : Math.max(0, data.count - 1),
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
    return removeSourceFromLibraryPage(old, sourceId);
  });
}

export function resetLibraryQueries(client: QueryClient): void {
  client.removeQueries({ queryKey: [LIBRARY_SOURCES_KEY] });
}
