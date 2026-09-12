import { describe, expect, it } from "vitest";
import {
  downloadUrlFor,
  estimateMp4Bytes,
  extensionFor,
  formatDuration,
  formatVideoQuality,
  formatVideoQueueMeta,
  initialDownloadStatus,
  isLongVideo,
  LONG_VIDEO_MS,
  needsTweetRefresh,
  originalImageUrl,
  parseVariantSize,
  pickBestMp4Url,
  remoteUrlFor,
  videoVariantMeta,
} from "./select";

describe("pickBestMp4Url", () => {
  it("picks the highest bit_rate mp4", () => {
    expect(
      pickBestMp4Url([
        {
          bit_rate: 632000,
          content_type: "video/mp4",
          url: "https://video.example/low.mp4",
        },
        {
          bit_rate: 2176000,
          content_type: "video/mp4",
          url: "https://video.example/high.mp4",
        },
        {
          content_type: "application/x-mpegURL",
          url: "https://video.example/stream.m3u8",
        },
      ]),
    ).toBe("https://video.example/high.mp4");
  });

  it("returns null when only HLS exists", () => {
    expect(
      pickBestMp4Url([
        {
          content_type: "application/x-mpegURL",
          url: "https://video.example/stream.m3u8",
        },
      ]),
    ).toBeNull();
  });
});

describe("originalImageUrl", () => {
  it("sets name=orig", () => {
    expect(
      originalImageUrl("https://pbs.twimg.com/media/abc.jpg?name=small"),
    ).toBe("https://pbs.twimg.com/media/abc.jpg?name=orig");
  });
});

describe("downloadUrlFor", () => {
  it("uses orig for photos and max bitrate for video", () => {
    expect(
      downloadUrlFor({
        type: "photo",
        media_url: "https://pbs.twimg.com/media/a.jpg",
      }),
    ).toBe("https://pbs.twimg.com/media/a.jpg?name=orig");
    expect(
      downloadUrlFor({
        type: "video",
        variants: [
          { bit_rate: 1, content_type: "video/mp4", url: "https://v/a.mp4" },
          { bit_rate: 9, content_type: "video/mp4", url: "https://v/b.mp4" },
        ],
      }),
    ).toBe("https://v/b.mp4");
  });
});

describe("extensionFor", () => {
  it("saves photos and video previews as webp", () => {
    expect(
      extensionFor({ type: "photo", url: "https://x/a.PNG?name=orig" }),
    ).toBe(".webp");
    expect(extensionFor({ type: "video", url: "https://x/a.mp4" })).toBe(
      ".webp",
    );
  });
});

describe("remoteUrlFor / needsTweetRefresh", () => {
  it("prefers mp4, then preview, and refreshes only when variants are unknown", () => {
    expect(
      remoteUrlFor({
        type: "video",
        media_url: null,
        preview_url: "https://pbs.twimg.com/preview.jpg",
        variants: [
          { bit_rate: 9, content_type: "video/mp4", url: "https://v/b.mp4" },
        ],
      }),
    ).toBe("https://v/b.mp4");
    expect(
      remoteUrlFor({
        type: "video",
        media_url: null,
        preview_url: "https://pbs.twimg.com/preview.jpg",
        variants: [],
        previewOnly: true,
      }),
    ).toBe("https://pbs.twimg.com/preview.jpg");
    expect(
      needsTweetRefresh({
        type: "video",
        media_url: null,
        variants: [],
        variants_json: null,
      }),
    ).toBe(true);
    expect(
      needsTweetRefresh({
        type: "video",
        media_url: null,
        variants: [],
        variants_json: "[]",
      }),
    ).toBe(false);
    expect(
      needsTweetRefresh({
        type: "photo",
        media_url: "https://pbs.twimg.com/media/a.jpg",
        variants: [],
        variants_json: null,
      }),
    ).toBe(false);
    expect(
      needsTweetRefresh({
        type: "photo",
        media_url: null,
        variants: [],
        variants_json: null,
      }),
    ).toBe(true);
    expect(
      needsTweetRefresh({
        type: "video",
        media_url:
          "https://video.twimg.com/ext_tw_video/a/pu/vid/avc1/640x360/x.mp4",
        variants: [],
        variants_json: null,
      }),
    ).toBe(true);
  });
});

describe("video variant quality and size", () => {
  it("reads WxH from twimg urls and labels the short side", () => {
    expect(
      parseVariantSize(
        "https://video.twimg.com/ext_tw_video/1/pu/vid/avc1/854x480/x.mp4",
      ),
    ).toEqual({ width: 854, height: 480 });
    expect(formatVideoQuality(854, 480)).toBe("480p");
    expect(formatVideoQuality(720, 1280)).toBe("720p");
    expect(formatVideoQuality(null, 480)).toBeNull();
  });

  it("estimates bytes from the best mp4 bit_rate", () => {
    expect(estimateMp4Bytes(8_000_000, 10_000)).toBe(10_000_000);
    expect(
      videoVariantMeta({
        variants: [
          {
            bit_rate: 256_000,
            content_type: "video/mp4",
            url: "https://video.twimg.com/vid/320x180/a.mp4",
          },
          {
            bit_rate: 832_000,
            content_type: "video/mp4",
            url: "https://video.twimg.com/vid/640x360/b.mp4",
          },
        ],
        width: 1280,
        height: 720,
        durationMs: 10_000,
      }),
    ).toEqual({
      qualityLabel: "360p",
      estimatedBytes: 1_040_000,
    });
  });

  it("prefers actual bytes and skips empty meta", () => {
    expect(
      formatVideoQueueMeta({
        estimatedBytes: 12_000_000,
        qualityLabel: "480p",
      }),
    ).toBe("約 11.4 MB · 480p");
    expect(
      formatVideoQueueMeta({
        bytes: 5 * 1024 * 1024,
        estimatedBytes: 12_000_000,
        qualityLabel: "720p",
        progressTotal: 9_000_000,
      }),
    ).toBe("5.0 MB · 720p");
    expect(formatVideoQueueMeta({})).toBeNull();
  });
});

describe("isLongVideo / formatDuration", () => {
  it("flags videos longer than 4 hours", () => {
    expect(isLongVideo("video", LONG_VIDEO_MS)).toBe(false);
    expect(isLongVideo("video", LONG_VIDEO_MS + 1)).toBe(true);
    expect(isLongVideo("photo", LONG_VIDEO_MS + 1)).toBe(false);
    expect(formatDuration(5 * 3_600_000 + 12 * 60_000).label).toBe("312:00");
    expect(formatDuration(3 * 60_000 + 5_000).label).toBe("3:05");
  });
});

describe("initialDownloadStatus", () => {
  it("never auto-downloads video; preview image is pending", () => {
    expect(
      initialDownloadStatus({
        media_key: "k",
        type: "video",
        duration_ms: LONG_VIDEO_MS + 1,
      }),
    ).toBe("pending");
    expect(initialDownloadStatus({ media_key: "k", type: "photo" })).toBe(
      "pending",
    );
  });
});
