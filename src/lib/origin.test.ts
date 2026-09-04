import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./origin";

describe("isSameOrigin", () => {
  it("accepts same-origin fetch metadata", () => {
    const req = new Request("https://x-idea.vercel.app/api/sync", {
      headers: { "sec-fetch-site": "same-origin" },
    });
    expect(isSameOrigin(req)).toBe(true);
  });

  it("rejects cross-site", () => {
    const req = new Request("https://x-idea.vercel.app/api/sync", {
      headers: {
        "sec-fetch-site": "cross-site",
        origin: "https://evil.example",
      },
    });
    expect(isSameOrigin(req)).toBe(false);
  });
});
