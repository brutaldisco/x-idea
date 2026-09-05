import { describe, expect, it } from "vitest";
import {
  extractHttpUrls,
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

describe("extractHttpUrls", () => {
  it("picks http(s) links from tweet text", () => {
    expect(
      extractHttpUrls(
        "see https://example.com/a, and https://x.com/i/article/1",
      ),
    ).toEqual(["https://example.com/a", "https://x.com/i/article/1"]);
  });
});

describe("shouldFetchArticle", () => {
  it("skips X status links, allows articles and other sites", () => {
    expect(shouldFetchArticle("https://x.com/a/status/1")).toBe(false);
    expect(shouldFetchArticle("https://x.com/i/article/123")).toBe(true);
    expect(shouldFetchArticle("https://example.com/post")).toBe(true);
    expect(
      isExcludedDomain("https://www.news.example/a", ["news.example"]),
    ).toBe(true);
  });
});
