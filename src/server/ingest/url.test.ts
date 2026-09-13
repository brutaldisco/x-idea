import { describe, expect, it } from "vitest";
import {
  canonicalXArticleUrl,
  extractHttpUrls,
  hostOf,
  isExcludedDomain,
  normalizeUrl,
  shouldFetchArticle,
  xArticleIdFromUrl,
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

describe("canonicalXArticleUrl", () => {
  it("rewrites http and twitter hosts to https://x.com/i/article/{id}", () => {
    expect(canonicalXArticleUrl("http://x.com/i/article/99")).toBe(
      "https://x.com/i/article/99",
    );
    expect(canonicalXArticleUrl("https://twitter.com/i/article/99")).toBe(
      "https://x.com/i/article/99",
    );
    expect(xArticleIdFromUrl("https://x.com/i/article/99?foo=1")).toBe("99");
    expect(canonicalXArticleUrl("https://example.com/i/article/99")).toBeNull();
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
