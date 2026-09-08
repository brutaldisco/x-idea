import { describe, expect, it } from "vitest";
import { nextBackfillCursor } from "@/lib/sync-backfill";

describe("nextBackfillCursor", () => {
  it("marks the list as exhausted when X has no next page", () => {
    expect(nextBackfillCursor(null)).toEqual({
      token: null,
      exhausted: true,
    });
  });

  it("keeps the pagination token when older pages remain", () => {
    expect(nextBackfillCursor("page-2")).toEqual({
      token: "page-2",
      exhausted: false,
    });
  });
});
