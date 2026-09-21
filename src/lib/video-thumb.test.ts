import { describe, expect, it } from "vitest";
import { resolveThumbSeekSeconds } from "./video-thumb";

describe("resolveThumbSeekSeconds", () => {
  it("keeps the requested second inside the duration", () => {
    expect(resolveThumbSeekSeconds(100, 12.5)).toBe(12.5);
    expect(resolveThumbSeekSeconds(10, 99)).toBe(9.95);
    expect(resolveThumbSeekSeconds(undefined, 3)).toBe(3);
  });

  it("rejects a negative seek", () => {
    expect(() => resolveThumbSeekSeconds(10, -1)).toThrow(
      "Invalid thumbnail seek position",
    );
  });
});
