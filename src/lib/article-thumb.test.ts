import { describe, expect, it } from "vitest";
import {
  absoluteHttpUrl,
  articleThumbMediaKey,
  firstContentImage,
  isArticleThumbMediaKey,
  resolveStoredThumbnail,
} from "./article-thumb";

describe("articleThumbMediaKey", () => {
  it("marks generated keys", () => {
    expect(articleThumbMediaKey("01ABC")).toBe("article-og:01ABC");
    expect(isArticleThumbMediaKey("article-og:01ABC")).toBe(true);
    expect(isArticleThumbMediaKey("3_111")).toBe(false);
    expect(isArticleThumbMediaKey(null)).toBe(false);
  });
});

describe("absoluteHttpUrl", () => {
  it("resolves relative paths and drops non-http", () => {
    expect(absoluteHttpUrl("/hero.jpg", "https://news.example/a")).toBe(
      "https://news.example/hero.jpg",
    );
    expect(absoluteHttpUrl("https://cdn.example/a.png", "https://x.test")).toBe(
      "https://cdn.example/a.png",
    );
    expect(absoluteHttpUrl("javascript:alert(1)", "https://news.example")).toBe(
      null,
    );
    expect(absoluteHttpUrl("", "https://news.example")).toBeNull();
  });
});

describe("firstContentImage", () => {
  it("picks the first img src", () => {
    expect(
      firstContentImage(
        '<p>hi</p><img alt="x" src="https://cdn.example/a.jpg">',
        "https://news.example",
      ),
    ).toBe("https://cdn.example/a.jpg");
  });
});

describe("resolveStoredThumbnail", () => {
  it("prefers stored og image then content img", () => {
    expect(
      resolveStoredThumbnail({
        thumbnailUrl: "https://cdn.example/og.jpg",
        contentHtml: '<img src="https://cdn.example/body.jpg">',
        baseUrl: "https://news.example",
      }),
    ).toBe("https://cdn.example/og.jpg");
    expect(
      resolveStoredThumbnail({
        thumbnailUrl: null,
        contentHtml: '<img src="/body.jpg">',
        baseUrl: "https://news.example/post",
      }),
    ).toBe("https://news.example/body.jpg");
  });

  it("treats an empty thumbnail_url as already checked", () => {
    expect(
      resolveStoredThumbnail({
        thumbnailUrl: "",
        contentHtml: '<img src="https://cdn.example/body.jpg">',
        baseUrl: "https://news.example",
      }),
    ).toBeNull();
  });
});
