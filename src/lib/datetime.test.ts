import { describe, expect, it } from "vitest";
import { formatCardDate } from "./datetime";

describe("formatCardDate", () => {
  it("formats ISO dates in Asia/Tokyo", () => {
    expect(formatCardDate("2026-09-04T15:00:00.000Z")).toBe("2026/9/5");
    expect(formatCardDate(null)).toBeNull();
  });
});
