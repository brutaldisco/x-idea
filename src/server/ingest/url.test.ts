import { describe, expect, it } from "vitest";
import { hostOf, normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("strips utm and trailing slash", () => {
    expect(normalizeUrl("https://Example.com/a/?utm_source=x")).toBe(
      "https://example.com/a",
    );
  });
});

describe("hostOf", () => {
  it("drops www", () => {
    expect(hostOf("https://www.example.com/x")).toBe("example.com");
  });
});
