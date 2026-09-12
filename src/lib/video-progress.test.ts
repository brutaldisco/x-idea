import { describe, expect, it } from "vitest";
import {
  videoDownloadBarPercent,
  videoDownloadByteLabel,
  videoDownloadPercent,
  videoQueueStatusLabel,
} from "@/lib/video-progress";

describe("video progress", () => {
  it("rounds a known total to a percent", () => {
    expect(videoDownloadPercent(512, 1024)).toBe(50);
    expect(videoDownloadPercent(0, 0)).toBe(null);
    expect(videoDownloadPercent(10, 0)).toBe(null);
  });

  it("uses estimate only for the bar, never 100%", () => {
    expect(videoDownloadBarPercent(0, 0, 10_000_000)).toBe(0);
    expect(videoDownloadBarPercent(5_000_000, 0, 10_000_000)).toBe(50);
    expect(videoDownloadBarPercent(20_000_000, 0, 10_000_000)).toBe(99);
    expect(videoDownloadBarPercent(5_000_000, 10_000_000, 8_000_000)).toBe(50);
  });

  it("shows received bytes against the known or estimated total", () => {
    expect(videoDownloadByteLabel(0, 0, null)).toBe(null);
    expect(videoDownloadByteLabel(1_048_576, 10_485_760, null)).toBe(
      "1.0 MB / 10.0 MB",
    );
    expect(videoDownloadByteLabel(0, 0, 38.7 * 1024 * 1024)).toBe(
      "0 B / 約 38.7 MB",
    );
    expect(videoDownloadByteLabel(2 * 1024 * 1024, 0, null)).toBe("2.0 MB");
  });

  it("labels downloading with a percent", () => {
    expect(videoQueueStatusLabel("downloading", 42)).toBe("ダウンロード中 42%");
    expect(videoQueueStatusLabel("downloading", null)).toBe("ダウンロード中");
    expect(videoQueueStatusLabel("queued", null)).toBe("待機中");
  });
});
