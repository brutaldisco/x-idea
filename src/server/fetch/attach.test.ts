import { describe, expect, it } from "vitest";
import { collectArticleLinks } from "./attach";

describe("collectArticleLinks", () => {
  it("merges entity urls and text urls", () => {
    const links = collectArticleLinks({
      text: "see https://example.com/from-text",
      entitiesJson: JSON.stringify({
        urls: [
          {
            expanded_url: "https://x.com/i/article/9",
            title: "X Article",
          },
        ],
      }),
    });
    expect(links.map((item) => item.url)).toEqual([
      "https://x.com/i/article/9",
      "https://example.com/from-text",
    ]);
    expect(links[0]?.title).toBe("X Article");
  });
});
