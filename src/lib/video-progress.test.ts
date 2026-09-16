import { describe, expect, it } from "vitest";
import {
  appendVideoSpeedSample,
  formatDownloadSpeed,
  nextVideoDownloadSpeed,
  VIDEO_SPEED_JUMP_BYTES,
  videoDownloadBarPercent,
  videoDownloadByteLabel,
  videoDownloadBytesPerSec,
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

  it("averages download speed over recent samples", () => {
    const samples = appendVideoSpeedSample([], 0, 1_000);
    const next = appendVideoSpeedSample(samples, 10 * 1024 * 1024, 2_000);
    expect(videoDownloadBytesPerSec(next, 2_000)).toBe(10 * 1024 * 1024);
    expect(formatDownloadSpeed(10 * 1024 * 1024)).toBe("10.0 MB/s");
    expect(formatDownloadSpeed(null)).toBe(null);
    expect(formatDownloadSpeed(0)).toBe("0 B/s");
  });

  it("waits for a short window before reporting speed", () => {
    const first = appendVideoSpeedSample([], 0, 1_000);
    const second = appendVideoSpeedSample(first, 8_000_000, 1_200);
    expect(videoDownloadBytesPerSec(second, 1_200)).toBe(null);
  });

  it("resets speed samples on rewind or resume jump", () => {
    const started = appendVideoSpeedSample([], 100, 1_000);
    const rewound = appendVideoSpeedSample(started, 50, 1_500);
    expect(rewound).toEqual([{ at: 1_500, received: 50 }]);
    const jumped = appendVideoSpeedSample(
      started,
      100 + VIDEO_SPEED_JUMP_BYTES + 1,
      1_500,
    );
    expect(jumped).toEqual([
      { at: 1_500, received: 100 + VIDEO_SPEED_JUMP_BYTES + 1 },
    ]);
  });

  it("decays speed to zero when bytes stop arriving", () => {
    let samples = appendVideoSpeedSample([], 1_000_000, 1_000);
    samples = appendVideoSpeedSample(samples, 5_000_000, 2_000);
    const stalled = nextVideoDownloadSpeed(samples, 5_000_000, 6_000);
    expect(stalled.bps).toBe(0);
  });

  it("decays an older window when queried later", () => {
    const samples = [
      { at: 0, received: 0 },
      { at: 1_000, received: 10 * 1024 * 1024 },
    ];
    expect(videoDownloadBytesPerSec(samples, 1_000)).toBe(10 * 1024 * 1024);
    expect(videoDownloadBytesPerSec(samples, 5_000)).toBe(2 * 1024 * 1024);
  });
});
