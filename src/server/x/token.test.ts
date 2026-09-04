import { describe, expect, it } from "vitest";
import { needsRefresh } from "./token";

describe("needsRefresh", () => {
  it("refreshes five minutes before expiry", () => {
    const now = Date.parse("2026-09-05T00:00:00.000Z");
    expect(needsRefresh(new Date(now + 4 * 60 * 1000).toISOString(), now)).toBe(
      true,
    );
    expect(
      needsRefresh(new Date(now + 10 * 60 * 1000).toISOString(), now),
    ).toBe(false);
  });
});
