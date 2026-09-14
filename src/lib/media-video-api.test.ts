import { describe, expect, it } from "vitest";
import {
  mediaVideoProxyFallbackPath,
  mediaVideoProxyPath,
  mediaVideoRedirectPath,
  mediaVideoUrlApiPath,
  parseVideoSourcePayload,
} from "./media-video-api";

describe("media video API paths", () => {
  it("builds same-origin helpers", () => {
    expect(mediaVideoUrlApiPath("m1")).toBe("/api/media/m1/url");
    expect(mediaVideoRedirectPath("m1")).toBe("/api/media/m1/url?redirect=1");
    expect(mediaVideoProxyPath("m1")).toBe("/api/media/m1/file");
    expect(mediaVideoProxyPath("m1", { inline: true })).toBe(
      "/api/media/m1/file?inline=1",
    );
  });

  it("encodes the media id", () => {
    expect(mediaVideoUrlApiPath("a/b")).toBe("/api/media/a%2Fb/url");
  });
});

describe("parseVideoSourcePayload", () => {
  it("reads url and positive bytes", () => {
    expect(
      parseVideoSourcePayload({
        url: "https://video.twimg.com/a.mp4",
        bytes: 12.9,
      }),
    ).toEqual({ url: "https://video.twimg.com/a.mp4", bytes: 12 });
  });

  it("rejects empty or non-string urls", () => {
    expect(parseVideoSourcePayload({ url: "" })).toBeNull();
    expect(parseVideoSourcePayload({ bytes: 10 })).toBeNull();
    expect(parseVideoSourcePayload(null)).toBeNull();
  });

  it("treats missing or invalid bytes as null", () => {
    expect(
      parseVideoSourcePayload({ url: "https://video.twimg.com/a.mp4" }),
    ).toEqual({ url: "https://video.twimg.com/a.mp4", bytes: null });
    expect(
      parseVideoSourcePayload({
        url: "https://video.twimg.com/a.mp4",
        bytes: 0,
      }),
    ).toEqual({ url: "https://video.twimg.com/a.mp4", bytes: null });
  });
});

describe("mediaVideoProxyFallbackPath", () => {
  it("maps the CDN redirect back to the inline proxy", () => {
    expect(
      mediaVideoProxyFallbackPath("/api/media/media-1/url?redirect=1"),
    ).toBe("/api/media/media-1/file?inline=1");
    expect(mediaVideoProxyFallbackPath("/api/media/media-1/url")).toBe(
      "/api/media/media-1/file?inline=1",
    );
  });

  it("leaves blob and proxy URLs alone", () => {
    expect(mediaVideoProxyFallbackPath("blob:https://x/1")).toBeNull();
    expect(
      mediaVideoProxyFallbackPath("/api/media/media-1/file?inline=1"),
    ).toBeNull();
  });
});
