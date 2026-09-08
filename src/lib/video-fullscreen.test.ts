import { describe, expect, it } from "vitest";
import { getFullscreenElement, isFullscreen } from "@/lib/video-fullscreen";

describe("video fullscreen helpers", () => {
  it("reads the current fullscreen element", () => {
    expect(getFullscreenElement()).toBe(null);
    expect(isFullscreen()).toBe(false);
  });
});
