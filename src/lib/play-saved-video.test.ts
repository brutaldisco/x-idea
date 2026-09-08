import { describe, expect, it } from "vitest";
import { resolveSavedVideoUrl } from "@/lib/play-saved-video";

describe("resolveSavedVideoUrl", () => {
  it("falls back to an inline media file URL without a local path", async () => {
    const result = await resolveSavedVideoUrl({ mediaId: "media-1" });
    expect(result.url).toBe("/api/media/media-1/file?inline=1");
    expect(result.revoke).toBeUndefined();
  });
});
