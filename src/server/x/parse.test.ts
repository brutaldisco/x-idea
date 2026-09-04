import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectUntilHead,
  isReply,
  parseBookmarksPage,
  tweetText,
  tweetUrls,
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
