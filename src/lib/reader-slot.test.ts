import { describe, expect, it } from "vitest";
import { isReaderSlotActive } from "./reader-slot";

describe("reader slot", () => {
  it("is active only on source paths", () => {
    expect(isReaderSlotActive("/source/01ABC")).toBe(true);
    expect(isReaderSlotActive("/library")).toBe(false);
    expect(isReaderSlotActive("/today")).toBe(false);
    expect(isReaderSlotActive("/videos")).toBe(false);
  });
});
