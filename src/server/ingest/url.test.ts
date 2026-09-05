import { describe, expect, it } from "vitest";
import {
  hostOf,
  isExcludedDomain,
  normalizeUrl,
  shouldFetchArticle,
} from "./url";

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

describe("shouldFetchArticle", () => {
  it("skips X hosts and matches excluded domains", () => {
    expect(shouldFetchArticle("https://x.com/a/status/1")).toBe(false);
    expect(shouldFetchArticle("https://example.com/post")).toBe(true);
    expect(
      isExcludedDomain("https://www.news.example/a", ["news.example"]),
    ).toBe(true);
  });
});
