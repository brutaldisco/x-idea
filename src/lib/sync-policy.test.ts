import { describe, expect, it } from "vitest";
import {
  bookmarkPageSize,
  clampSyncIntervalMin,
  INCREMENTAL_BOOKMARK_PAGE,
  isAutoSyncDue,
  MIN_SYNC_INTERVAL_MIN,
} from "./sync-policy";

describe("clampSyncIntervalMin", () => {
  it("does not allow shorter than 6 hours", () => {
    expect(clampSyncIntervalMin(30)).toBe(MIN_SYNC_INTERVAL_MIN);
    expect(clampSyncIntervalMin(360)).toBe(360);
    expect(clampSyncIntervalMin(720)).toBe(720);
  });
});

describe("bookmarkPageSize", () => {
  it("uses a small page for incremental checks", () => {
    expect(bookmarkPageSize(true)).toBe(INCREMENTAL_BOOKMARK_PAGE);
    expect(bookmarkPageSize(false)).toBe(100);
  });
});

describe("isAutoSyncDue", () => {
  const now = Date.parse("2026-09-06T00:00:00.000Z");

  it("is due when never synced", () => {
    expect(isAutoSyncDue(null, 360, now)).toBe(true);
  });

  it("waits at least 6 hours after the last sync", () => {
    expect(isAutoSyncDue("2026-09-05T18:00:00.000Z", 360, now)).toBe(true);
    expect(isAutoSyncDue("2026-09-05T18:01:00.000Z", 360, now)).toBe(false);
  });
});
