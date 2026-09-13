import { describe, expect, it } from "vitest";
import { mapSourceListItem } from "./query";

describe("mapSourceListItem", () => {
  it("reads author avatar fields", () => {
    const item = mapSourceListItem({
      id: "s1",
      kind: "post",
      ai_summary: null,
      text: "hello world enough text for a card summary here",
      saved_at: "2026-09-13T00:00:00.000Z",
      triage_status: "inbox",
      author_username: "alice",
      author_name: "Alice",
      author_avatar_url: "https://pbs.twimg.com/profile_images/1/a_normal.jpg",
    });
    expect(item.authorName).toBe("Alice");
    expect(item.authorUsername).toBe("alice");
    expect(item.authorAvatarUrl).toBe(
      "https://pbs.twimg.com/profile_images/1/a_normal.jpg",
    );
  });
});
