import { describe, expect, it } from "vitest";
import {
  absoluteHttpUrl,
  articleThumbMediaKey,
  firstContentImage,
  isArticleThumbMediaKey,
  mediaCoverRank,
  pickCoverMedia,
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

  it("picks an image href when img was stripped", () => {
    expect(
      firstContentImage(
        '<p><a href="https://i.gzn.jp/img/a/00.png"></a></p>',
        "https://gigazine.net",
      ),
    ).toBe("https://i.gzn.jp/img/a/00.png");
  });
});

describe("mediaCoverRank / pickCoverMedia", () => {
  it("puts video ahead of any still image", () => {
    expect(mediaCoverRank({ type: "video" })).toBe(0);
    expect(mediaCoverRank({ type: "animated_gif" })).toBe(0);
    expect(mediaCoverRank({ type: "photo", mediaKey: "3_111" })).toBe(1);
    expect(
      mediaCoverRank({ type: "photo", mediaKey: "article-og:01ABC" }),
    ).toBe(2);
    expect(
      pickCoverMedia([
        {
          id: "og",
          type: "photo",
          mediaKey: "article-og:01ABC",
          createdAt: "2026-01-01",
        },
        {
          id: "shot",
          type: "photo",
          mediaKey: "3_111",
          createdAt: "2026-01-02",
        },
        {
          id: "clip",
          type: "video",
          mediaKey: "7_222",
          createdAt: "2026-01-03",
        },
      ])?.id,
    ).toBe("clip");
  });

  it("uses a native photo before an article og image", () => {
    expect(
      pickCoverMedia([
        {
          id: "og",
          type: "photo",
          mediaKey: "article-og:01ABC",
          createdAt: "2026-01-01",
        },
        {
          id: "shot",
          type: "photo",
          mediaKey: "3_111",
          createdAt: "2026-01-02",
        },
      ])?.id,
    ).toBe("shot");
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

  it("still uses content images when thumbnail_url is empty", () => {
    expect(
      resolveStoredThumbnail({
        thumbnailUrl: "",
        contentHtml: '<img src="https://cdn.example/body.jpg">',
        baseUrl: "https://news.example",
      }),
    ).toBe("https://cdn.example/body.jpg");
  });
});
