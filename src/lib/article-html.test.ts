import { describe, expect, it } from "vitest";
import {
  imgParagraphs,
  isLikelyImageUrl,
  restoreStrippedImages,
  sanitizeArticleHtml,
} from "./article-html";

describe("isLikelyImageUrl", () => {
  it("accepts image paths and rejects pages", () => {
    expect(
      isLikelyImageUrl(
        "https://i.gzn.jp/img/2026/08/10/a/00.png",
        "https://gigazine.net",
      ),
    ).toBe(true);
    expect(
      isLikelyImageUrl(
        "https://github.com/oboroge0/hayamimi/actions/workflows/test.yml",
        "https://github.com",
      ),
    ).toBe(false);
  });
});

describe("restoreStrippedImages", () => {
  it("turns empty image links back into img", () => {
    const html =
      '<p><a href="https://i.gzn.jp/img/2026/08/10/cloudflare-kitesurf/00.png"></a></p>';
    expect(restoreStrippedImages(html, "https://gigazine.net/news")).toBe(
      '<p><img src="https://i.gzn.jp/img/2026/08/10/cloudflare-kitesurf/00.png" alt=""></p>',
    );
  });

  it("leaves non-image empty links alone", () => {
    const html = '<p><a href="https://github.com/acme/repo"></a></p>';
    expect(restoreStrippedImages(html, "https://github.com")).toBe(html);
  });
});

describe("sanitizeArticleHtml", () => {
  it("keeps img tags", () => {
    const html = sanitizeArticleHtml(
      '<p>hi</p><img src="https://cdn.example/a.jpg" alt="図">',
      "https://news.example",
    );
    expect(html).toContain('src="https://cdn.example/a.jpg"');
    expect(html).toContain("<img");
  });
});

describe("imgParagraphs", () => {
  it("dedupes and escapes", () => {
    expect(
      imgParagraphs([
        "https://pbs.twimg.com/media/a.jpg",
        "https://pbs.twimg.com/media/a.jpg",
      ]),
    ).toBe('<p><img src="https://pbs.twimg.com/media/a.jpg" alt=""></p>');
  });
});
