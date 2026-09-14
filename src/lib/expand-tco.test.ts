import { describe, expect, it } from "vitest";
import {
  containsTco,
  destinationUrl,
  expandTcoInText,
  expansionsFromEntitiesJson,
  expansionsFromUrlEntities,
  isTcoUrl,
} from "./expand-tco";

describe("isTcoUrl", () => {
  it("detects t.co hosts", () => {
    expect(isTcoUrl("https://t.co/JWMgU9C16v")).toBe(true);
    expect(isTcoUrl("http://www.t.co/JWMgU9C16v")).toBe(true);
    expect(isTcoUrl("https://example.com/a")).toBe(false);
  });
});

describe("destinationUrl", () => {
  it("prefers unwound then expanded and skips leftover t.co", () => {
    expect(
      destinationUrl({
        url: "https://t.co/JWMgU9C16v",
        expanded_url: "https://t.co/JWMgU9C16v",
      }),
    ).toBeNull();
    expect(
      destinationUrl({
        url: "https://t.co/JWMgU9C16v",
        expanded_url: "https://news.example/a?utm=1",
        unwound_url: "https://news.example/a",
      }),
    ).toBe("https://news.example/a");
  });
});

describe("expandTcoInText", () => {
  it("replaces t.co with the original external URL", () => {
    const expansions = expansionsFromUrlEntities([
      {
        url: "https://t.co/JWMgU9C16v",
        expanded_url: "https://github.com/acme/repo",
      },
    ]);
    expect(
      expandTcoInText("資料は https://t.co/JWMgU9C16v です", expansions),
    ).toBe("資料は https://github.com/acme/repo です");
    expect(
      expandTcoInText("<p>see http://t.co/JWMgU9C16v</p>", expansions),
    ).toBe("<p>see https://github.com/acme/repo</p>");
  });

  it("leaves text alone when there is no t.co", () => {
    expect(containsTco("https://example.com")).toBe(false);
    expect(expandTcoInText("https://example.com", [])).toBe(
      "https://example.com",
    );
  });

  it("reads article_urls from stored entities json", () => {
    const expansions = expansionsFromEntitiesJson({
      urls: [
        {
          url: "https://t.co/article",
          expanded_url: "https://x.com/i/article/99",
        },
      ],
      article_urls: [
        {
          url: "https://t.co/JWMgU9C16v",
          expanded_url: "https://example.com/paper",
        },
      ],
    });
    expect(expandTcoInText("本文 https://t.co/JWMgU9C16v", expansions)).toBe(
      "本文 https://example.com/paper",
    );
  });

  it("reads nested tweet / article entity objects", () => {
    const expansions = expansionsFromEntitiesJson({
      entities: {
        urls: [
          {
            url: "https://t.co/abcd",
            expanded_url: "https://example.com/from-tweet",
          },
        ],
      },
      article: {
        entities: {
          urls: [
            {
              url: "https://t.co/JWMgU9C16v",
              expanded_url: "https://example.com/from-article",
            },
          ],
        },
      },
    });
    expect(
      expandTcoInText(
        "https://t.co/abcd and https://t.co/JWMgU9C16v",
        expansions,
      ),
    ).toBe(
      "https://example.com/from-tweet and https://example.com/from-article",
    );
  });
});
