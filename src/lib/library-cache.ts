import type { InfiniteData, QueryClient } from "@tanstack/react-query";

export const LIBRARY_SOURCES_KEY = "sources";

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
