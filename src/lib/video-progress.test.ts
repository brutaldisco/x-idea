import { describe, expect, it } from "vitest";
import {
  videoDownloadPercent,
  videoQueueStatusLabel,
} from "@/lib/video-progress";

describe("video progress", () => {
  it("rounds a known total to a percent", () => {
    expect(videoDownloadPercent(512, 1024)).toBe(50);
    expect(videoDownloadPercent(0, 0)).toBe(null);
    expect(videoDownloadPercent(10, 0)).toBe(null);
  });

  it("labels downloading with a percent", () => {
    expect(videoQueueStatusLabel("downloading", 42)).toBe("ダウンロード中 42%");
    expect(videoQueueStatusLabel("downloading", null)).toBe("ダウンロード中");
    expect(videoQueueStatusLabel("queued", null)).toBe("待機中");
  });
});
