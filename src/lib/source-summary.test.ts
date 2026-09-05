import { describe, expect, it } from "vitest";
import { cardSummary } from "@/lib/source-summary";

describe("cardSummary", () => {
  it("prefers article body over a link-only AI summary", () => {
    const result = cardSummary({
      aiSummary: "リンクのみが共有されている投稿です。",
      postText: "https://t.co/abcd",
      articleExcerpt:
        "How to become a Robotics Engineer\nRobotics is the least crowded high-value skill in tech right now",
    });
    expect(result.fromAi).toBe(false);
    expect(result.summary).toContain("Robotics is the least crowded");
  });

  it("falls back to AI then short post text", () => {
    expect(
      cardSummary({
        aiSummary: "要点だけ残す。",
        postText: "https://t.co/abcd",
      }),
    ).toEqual({ summary: "要点だけ残す。", fromAi: true });
  });
});
