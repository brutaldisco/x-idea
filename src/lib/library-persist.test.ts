import { describe, expect, it } from "vitest";
import { trimPersistedSources } from "@/lib/library-persist";

describe("library persist", () => {
  it("keeps at most eight source pages", () => {
    const pages = Array.from({ length: 12 }, (_, index) => ({
      items: [{ id: String(index) }],
      nextCursor: index < 11 ? String(index + 1) : null,
      count: index === 0 ? 12 : null,
    }));
    const trimmed = trimPersistedSources({
      timestamp: 1,
      buster: "t",
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey: ["sources", "acc", "posted_desc", "{}"],
            queryHash: "x",
            state: {
              data: {
                pages,
                pageParams: pages.map((_, index) =>
                  index === 0 ? undefined : String(index),
                ),
              },
              dataUpdateCount: 1,
              dataUpdatedAt: 1,
              error: null,
              errorUpdateCount: 0,
              errorUpdatedAt: 0,
              fetchFailureCount: 0,
              fetchFailureReason: null,
              fetchMeta: null,
              isInvalidated: false,
              status: "success",
              fetchStatus: "idle",
            },
          },
        ],
      },
    });
    const data = trimmed.clientState.queries[0]?.state.data as {
      pages: unknown[];
      pageParams: unknown[];
    };
    expect(data.pages).toHaveLength(8);
    expect(data.pageParams).toHaveLength(8);
  });
});
