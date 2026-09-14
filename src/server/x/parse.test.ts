import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bookmarkErrorAction,
  collectUntilHead,
  hasUnresolvedArticleMedia,
  isGoneTweetError,
  isReply,
  lookupGapActions,
  parseBookmarksPage,
  tweetEntitiesForStorage,
  tweetText,
  tweetUrlEntries,
  tweetUrls,
  xArticleBody,
  xArticleImageUrls,
  xArticlePermalink,
} from "./parse";

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures/x/bookmarks-page.json"), "utf8"),
);

describe("parseBookmarksPage", () => {
  it("reads tweets, users, media and prefers note_tweet", () => {
    const page = parseBookmarksPage(fixture);
    expect(page.tweets).toHaveLength(3);
    expect(tweetText(page.tweets[0])).toBe("新しい論文メモ。長い本文です。");
    expect(tweetUrls(page.tweets[0])).toEqual(["https://example.com/paper"]);
    expect(page.users.get("99")?.username).toBe("alice");
    expect(page.media.get("3_111")?.type).toBe("photo");
    expect(page.media.get("13_222")?.variants?.[1]?.url).toBe(
      "https://example.com/high.mp4",
    );
    expect(isReply(page.tweets[2])).toBe(true);
  });
});

describe("X Article fields", () => {
  it("reads article.plain_text as the tweet body", () => {
    const page = parseBookmarksPage({
      data: [
        {
          id: "9",
          text: "https://t.co/article",
          entities: {
            urls: [
              {
                url: "https://t.co/article",
                expanded_url: "https://x.com/i/article/99",
              },
            ],
          },
          article: {
            id: "99",
            title: "How to become a Robotics Engineer",
            plain_text:
              "Robotics is the least crowded high-value skill in tech right now",
            cover_media: {
              url: "https://pbs.twimg.com/media/cover.jpg",
            },
            media_entities: [
              { preview_image_url: "https://pbs.twimg.com/media/inline.jpg" },
            ],
            entities: { code: [{ content: "ros2 topic list" }] },
          },
        },
      ],
    });
    const tweet = page.tweets[0];
    expect(tweet.article?.title).toBe("How to become a Robotics Engineer");
    expect(xArticlePermalink(tweet)).toBe("https://x.com/i/article/99");
    expect(xArticleBody(tweet.article)).toContain("least crowded");
    expect(xArticleBody(tweet.article)).toContain("ros2 topic list");
    expect(tweetText(tweet)).toContain("How to become a Robotics Engineer");
    expect(tweetText(tweet)).toContain("least crowded");
    expect(tweet.article?.coverUrl).toBe(
      "https://pbs.twimg.com/media/cover.jpg",
    );
    expect(xArticleImageUrls(tweet)).toEqual([
      "https://pbs.twimg.com/media/cover.jpg",
      "https://pbs.twimg.com/media/inline.jpg",
    ]);
  });

  it("resolves article media_key strings via includes.media", () => {
    const page = parseBookmarksPage({
      data: [
        {
          id: "9",
          text: "https://t.co/article",
          article: {
            id: "99",
            title: "Grok article",
            plain_text: "body ".repeat(80),
            cover_media: "3_2089676448218894336",
            media_entities: ["3_2089676448218894336", "3_inline"],
          },
        },
      ],
      includes: {
        media: [
          {
            media_key: "3_2089676448218894336",
            type: "photo",
            url: "https://pbs.twimg.com/media/cover.jpg",
          },
          {
            media_key: "3_inline",
            type: "photo",
            preview_image_url: "https://pbs.twimg.com/media/inline.jpg",
          },
        ],
      },
    });
    const tweet = page.tweets[0];
    expect(tweet.article?.coverUrl).toBe(
      "https://pbs.twimg.com/media/cover.jpg",
    );
    expect(xArticleImageUrls(tweet)).toEqual([
      "https://pbs.twimg.com/media/cover.jpg",
      "https://pbs.twimg.com/media/inline.jpg",
    ]);
    expect(hasUnresolvedArticleMedia(tweet)).toBe(false);
  });

  it("keeps unresolved media keys when includes.media is empty", () => {
    const page = parseBookmarksPage({
      data: [
        {
          id: "9",
          text: "https://t.co/article",
          article: {
            id: "99",
            title: "Grok article",
            plain_text: "body ".repeat(80),
            cover_media: "3_2089676448218894336",
            media_entities: ["3_2089676448218894336"],
          },
        },
      ],
    });
    expect(page.tweets[0]?.article?.coverUrl).toBeUndefined();
    expect(hasUnresolvedArticleMedia(page.tweets[0])).toBe(true);
  });

  it("expands t.co in article.plain_text via article.entities.urls", () => {
    const page = parseBookmarksPage({
      data: [
        {
          id: "9",
          text: "https://t.co/article",
          entities: {
            urls: [
              {
                url: "https://t.co/article",
                expanded_url: "https://x.com/i/article/99",
              },
            ],
          },
          article: {
            id: "99",
            title: "Links",
            plain_text: "資料は https://t.co/JWMgU9C16v です",
            entities: {
              urls: [
                {
                  url: "https://t.co/JWMgU9C16v",
                  expanded_url: "https://github.com/acme/repo",
                  display_url: "github.com/acme/repo",
                },
              ],
            },
          },
        },
      ],
    });
    const tweet = page.tweets[0];
    expect(xArticleBody(tweet.article)).toBe(
      "資料は https://github.com/acme/repo です",
    );
    expect(tweetText(tweet)).toContain("https://github.com/acme/repo");
    expect(tweetText(tweet)).not.toContain("t.co");
    const stored = JSON.parse(tweetEntitiesForStorage(tweet) ?? "{}") as {
      urls?: { expanded_url?: string }[];
      article_urls?: { expanded_url?: string }[];
    };
    expect(stored.urls?.[0]?.expanded_url).toBe("https://x.com/i/article/99");
    expect(stored.article_urls?.[0]?.expanded_url).toBe(
      "https://github.com/acme/repo",
    );
  });

  it("expands t.co in note_tweet and short tweet text", () => {
    expect(
      tweetText({
        id: "1",
        text: "see https://t.co/abcd",
        note_tweet: {
          text: "長い本文 https://t.co/abcd",
          entities: {
            urls: [
              {
                url: "https://t.co/abcd",
                expanded_url: "https://example.com/paper",
              },
            ],
          },
        },
      }),
    ).toBe("長い本文 https://example.com/paper");
    expect(
      tweetText({
        id: "2",
        text: "see https://t.co/abcd",
        entities: {
          urls: [
            {
              url: "https://t.co/abcd",
              expanded_url: "https://example.com/paper",
            },
          ],
        },
      }),
    ).toBe("see https://example.com/paper");
  });

  it("reads card images from url entities", () => {
    const links = tweetUrlEntries({
      urls: [
        {
          expanded_url: "https://news.example/a",
          images: [{ url: "https://cdn.example/card.jpg" }],
        },
      ],
    });
    expect(links[0]?.image).toBe("https://cdn.example/card.jpg");
  });
});

describe("collectUntilHead", () => {
  it("stops at the known head and keeps newer tweets", () => {
    const page = parseBookmarksPage(fixture);
    const cut = collectUntilHead(page.tweets, "2000");
    expect(cut.hitHead).toBe(true);
    expect(cut.keep.map((tweet) => tweet.id)).toEqual(["2001"]);
    expect(cut.pageHead).toBe("2001");
  });

  it("keeps the whole page when there is no head", () => {
    const page = parseBookmarksPage(fixture);
    const cut = collectUntilHead(page.tweets, null);
    expect(cut.hitHead).toBe(false);
    expect(cut.keep).toHaveLength(3);
  });
});

describe("gone tweet errors", () => {
  it("treats Not Found as purge", () => {
    const error = {
      resource_id: "123",
      resource_type: "tweet",
      title: "Not Found Error",
      type: "https://api.twitter.com/2/problems/resource-not-found",
    };
    expect(isGoneTweetError(error)).toBe(true);
    expect(bookmarkErrorAction(error)).toBe("purge");
  });

  it("keeps protected tweets as unavailable", () => {
    const error = {
      resource_id: "123",
      resource_type: "tweet",
      title: "Authorization Error",
      type: "https://api.twitter.com/2/problems/not-authorized-to-view",
    };
    expect(isGoneTweetError(error)).toBe(false);
    expect(bookmarkErrorAction(error)).toBe("unavailable");
  });

  it("ignores non-tweet errors", () => {
    expect(
      bookmarkErrorAction({
        resource_id: "99",
        resource_type: "user",
        title: "Not Found Error",
      }),
    ).toBe("ignore");
  });

  it("reads resource_id from value when X omits it", () => {
    const page = parseBookmarksPage({
      data: [],
      errors: [
        {
          value: "555",
          title: "Not Found Error",
          resource_type: "tweet",
          type: "https://api.twitter.com/2/problems/resource-not-found",
        },
      ],
    });
    expect(page.errors[0]?.resource_id).toBe("555");
    expect(bookmarkErrorAction(page.errors[0] ?? {})).toBe("purge");
  });

  it("treats lookup IDs missing from data as gone", () => {
    const page = parseBookmarksPage({
      data: [{ id: "keep", text: "ok" }],
      errors: [
        {
          resource_id: "priv",
          resource_type: "tweet",
          title: "Authorization Error",
        },
      ],
    });
    expect(lookupGapActions(["keep", "gone", "priv"], page)).toEqual([
      { tweetId: "gone", action: "purge" },
      { tweetId: "priv", action: "unavailable" },
    ]);
  });
});
