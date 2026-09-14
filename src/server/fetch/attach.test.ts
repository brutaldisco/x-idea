import { describe, expect, it } from "vitest";
import { collectArticleLinks } from "./attach";

describe("collectArticleLinks", () => {
  it("merges entity urls and text urls", () => {
    const links = collectArticleLinks({
      text: "see https://example.com/from-text",
      entitiesJson: JSON.stringify({
        urls: [
          {
            expanded_url: "https://news.example/card",
            title: "X Article",
            images: [{ url: "https://pbs.twimg.com/media/card.jpg" }],
          },
        ],
      }),
    });
    expect(links.map((item) => item.url)).toEqual([
      "https://news.example/card",
      "https://example.com/from-text",
    ]);
    expect(links[0]?.title).toBe("X Article");
    expect(links[0]?.image).toBe("https://pbs.twimg.com/media/card.jpg");
  });

  it("does not attach article-body urls when the tweet is an X article", () => {
    const links = collectArticleLinks({
      text: "資料は https://github.com/acme/repo です",
      entitiesJson: JSON.stringify({
        urls: [{ expanded_url: "https://x.com/i/article/9" }],
        article_urls: [{ expanded_url: "https://github.com/acme/repo" }],
      }),
    });
    expect(links.map((item) => item.url)).toEqual([
      "https://x.com/i/article/9",
    ]);
  });
});
