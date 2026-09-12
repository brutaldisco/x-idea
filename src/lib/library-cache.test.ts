import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  LIBRARY_SOURCES_KEY,
  LIBRARY_TAXONOMY_KEY,
  libraryFilterKey,
  libraryQueryKey,
  libraryTaxonomyQueryKey,
  patchSourceInLibraryQueries,
  removeSourceFromLibraryPage,
  removeSourceFromLibraryQueries,
  resetLibraryQueries,
} from "@/lib/library-cache";

describe("library cache", () => {
  it("keeps the list key stable without an account segment", () => {
    expect(libraryQueryKey("posted_desc", libraryFilterKey({}))).toEqual([
      LIBRARY_SOURCES_KEY,
      "posted_desc",
      "{}",
      1,
    ]);
    expect(libraryQueryKey("posted_desc", libraryFilterKey({}), 3)).toEqual([
      LIBRARY_SOURCES_KEY,
      "posted_desc",
      "{}",
      3,
    ]);
  });

  it("removes the row and decrements the count", () => {
    const next = removeSourceFromLibraryPage(
      {
        items: [{ id: "a" }, { id: "b" }, { id: "c" }],
        nextCursor: null,
        count: 63,
      },
      "b",
    );
    expect(next.count).toBe(62);
    expect(next.items.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("patches a source row in every sources query", () => {
    const client = new QueryClient();
    const key = ["sources", "posted_desc", "{}", 1];
    client.setQueryData(key, {
      items: [
        { id: "a", categoryId: "old" },
        { id: "b", categoryId: "keep" },
      ],
      nextCursor: null,
      count: 2,
    });
    patchSourceInLibraryQueries(client, "a", { categoryId: "next" });
    expect(
      client.getQueryData<{
        items: Array<{ id: string; categoryId: string }>;
      }>(key)?.items,
    ).toEqual([
      { id: "a", categoryId: "next" },
      { id: "b", categoryId: "keep" },
    ]);
  });

  it("updates every sources query and can reset them", () => {
    const client = new QueryClient();
    const key = ["sources", "posted_desc", "{}", 1];
    client.setQueryData(key, {
      items: [{ id: "a" }, { id: "b" }],
      nextCursor: null,
      count: 2,
    });
    removeSourceFromLibraryQueries(client, "a");
    expect(
      client.getQueryData<{ items: Array<{ id: string }> }>(key)?.items,
    ).toEqual([{ id: "b" }]);
    const taxKey = libraryTaxonomyQueryKey("acc1");
    client.setQueryData(taxKey, {
      categories: [{ id: "c1", name: "旧" }],
      infoTypes: [],
    });
    resetLibraryQueries(client);
    expect(client.getQueryData(key)).toBeUndefined();
    expect(client.getQueryData(taxKey)).toBeUndefined();
    expect(taxKey[0]).toBe(LIBRARY_TAXONOMY_KEY);
  });
});
