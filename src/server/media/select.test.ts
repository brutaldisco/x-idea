import { describe, expect, it } from "vitest";
import {
  downloadUrlFor,
  extensionFor,
  formatDuration,
  initialDownloadStatus,
  isLongVideo,
  LONG_VIDEO_MS,
  needsTweetRefresh,
  originalImageUrl,
  pickBestMp4Url,
  remoteUrlFor,
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

describe("isLongVideo / formatDuration", () => {
  it("flags videos longer than 4 hours", () => {
    expect(isLongVideo("video", LONG_VIDEO_MS)).toBe(false);
    expect(isLongVideo("video", LONG_VIDEO_MS + 1)).toBe(true);
    expect(isLongVideo("photo", LONG_VIDEO_MS + 1)).toBe(false);
    expect(formatDuration(5 * 3_600_000 + 12 * 60_000).label).toBe(
      "5時間 12分",
    );
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
