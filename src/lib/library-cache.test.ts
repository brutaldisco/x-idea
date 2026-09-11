import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  LIBRARY_SOURCES_KEY,
  libraryFilterKey,
  libraryQueryKey,
  removeSourceFromLibraryPages,
  removeSourceFromLibraryQueries,
  resetLibraryQueries,
} from "@/lib/library-cache";

describe("library cache", () => {
  it("keeps the list key stable without an account segment", () => {
    expect(libraryQueryKey("posted_desc", libraryFilterKey({}))).toEqual([
      LIBRARY_SOURCES_KEY,
      "posted_desc",
      "{}",
    ]);
  });

  it("removes the row and decrements the first-page count", () => {
    const next = removeSourceFromLibraryPages(
      {
        pageParams: [undefined, "c2"],
        pages: [
          {
            items: [{ id: "a" }, { id: "b" }],
            nextCursor: "c2",
            count: 4,
          },
          { items: [{ id: "c" }, { id: "d" }], nextCursor: null, count: null },
        ],
      },
      "c",
    );
    expect(next.pages[0]?.count).toBe(3);
    expect(next.pages[0]?.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(next.pages[1]?.items.map((item) => item.id)).toEqual(["d"]);
  });

  it("updates every sources query and can reset them", () => {
    const client = new QueryClient();
    const key = ["sources", "posted_desc", "{}"];
    client.setQueryData(key, {
      pageParams: [undefined],
      pages: [
        { items: [{ id: "a" }, { id: "b" }], nextCursor: null, count: 2 },
      ],
    });
    removeSourceFromLibraryQueries(client, "a");
    expect(
      client.getQueryData<{ pages: Array<{ items: Array<{ id: string }> }> }>(
        key,
      )?.pages[0]?.items,
    ).toEqual([{ id: "b" }]);
    resetLibraryQueries(client);
    expect(client.getQueryData(key)).toBeUndefined();
  });
});
