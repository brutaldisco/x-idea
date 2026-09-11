import { describe, expect, it } from "vitest";
import {
  leftoverBackfillCursor,
  nextBackfillCursor,
} from "@/lib/sync-backfill";

describe("nextBackfillCursor", () => {
  it("marks the list as exhausted when X has no next page", () => {
    expect(nextBackfillCursor(null, { fetched: 12, pageSize: 100 })).toEqual({
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

  it("does not lock out a full page that omitted next_token", () => {
    expect(
      nextBackfillCursor(null, {
        fetched: 100,
        pageSize: 100,
        previousToken: "page-1",
      }),
    ).toEqual({ token: "page-1", exhausted: false });
  });
});

describe("leftoverBackfillCursor", () => {
  it("hands the leftover token to an unused backfill cursor", () => {
    expect(
      leftoverBackfillCursor({
        nextToken: "page-2",
        alreadyExhausted: false,
        existingToken: null,
      }),
    ).toEqual({ token: "page-2", exhausted: false });
  });

  it("does not rewind an in-progress backfill", () => {
    expect(
      leftoverBackfillCursor({
        nextToken: "newer",
        alreadyExhausted: false,
        existingToken: "older",
      }),
    ).toBeNull();
  });
});
