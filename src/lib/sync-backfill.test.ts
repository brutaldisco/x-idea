import { describe, expect, it } from "vitest";
import { backfillStep, leftoverBackfillCursor } from "@/lib/sync-backfill";

describe("backfillStep", () => {
  it("continues when X hands a next_token", () => {
    expect(
      backfillStep({ nextToken: "abc", fetched: 100, pageSize: 100 }),
    ).toEqual({ action: "continue", token: "abc" });
  });

  it("probes with a smaller page when a partial page has no token", () => {
    expect(
      backfillStep({ nextToken: null, fetched: 80, pageSize: 100 }),
    ).toEqual({ action: "probe", pageSize: 10 });
  });

  it("probes even when a full page omits the token", () => {
    expect(
      backfillStep({ nextToken: null, fetched: 100, pageSize: 100 }),
    ).toEqual({ action: "probe", pageSize: 10 });
  });

  it("is exhausted when the probe size also lacks a token", () => {
    expect(
      backfillStep({ nextToken: null, fetched: 10, pageSize: 10 }),
    ).toEqual({ action: "exhausted" });
    expect(backfillStep({ nextToken: null, fetched: 3, pageSize: 10 })).toEqual(
      {
        action: "exhausted",
      },
    );
  });

  it("is exhausted on an empty page", () => {
    expect(
      backfillStep({ nextToken: null, fetched: 0, pageSize: 100 }),
    ).toEqual({ action: "exhausted" });
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
