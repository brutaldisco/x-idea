import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bookmarkErrorAction,
  collectUntilHead,
  isGoneTweetError,
  isReply,
  lookupGapActions,
  parseBookmarksPage,
  tweetText,
  tweetUrls,
  xArticleBody,
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
