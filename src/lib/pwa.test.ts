import { describe, expect, it } from "vitest";
import {
  isPwaPublicPath,
  isReaderPath,
  isSourcesApiPath,
  isStaticAssetPath,
  PWA_START_URL,
  safeInternalPath,
  shouldBypassServiceWorker,
} from "./pwa";

describe("isPwaPublicPath", () => {
  it("allows install assets without a passcode cookie", () => {
    expect(isPwaPublicPath("/sw.js")).toBe(true);
    expect(isPwaPublicPath("/offline")).toBe(true);
    expect(isPwaPublicPath("/manifest.webmanifest")).toBe(true);
    expect(isPwaPublicPath("/icons/icon-192.png")).toBe(true);
  });

  it("does not open the app itself", () => {
    expect(isPwaPublicPath("/today")).toBe(false);
    expect(isPwaPublicPath("/settings")).toBe(false);
  });
});

describe("shouldBypassServiceWorker", () => {
  it("leaves mutations and large media on the network", () => {
    expect(shouldBypassServiceWorker("/today", "POST")).toBe(true);
    expect(shouldBypassServiceWorker("/api/media/abc/file", "GET")).toBe(true);
    expect(shouldBypassServiceWorker("/api/videos/queue", "GET")).toBe(true);
    expect(shouldBypassServiceWorker("/today", "GET")).toBe(false);
  });
});

describe("path classifiers", () => {
  it("recognizes cache lanes", () => {
    expect(isSourcesApiPath("/api/sources/1")).toBe(true);
    expect(isReaderPath("/source/abc")).toBe(true);
    expect(isStaticAssetPath("/_next/static/chunks/app.js")).toBe(true);
  });
});

describe("safeInternalPath", () => {
  it("keeps in-app paths including share-target query", () => {
    expect(safeInternalPath("/capture?url=https://x.com/a")).toBe(
      "/capture?url=https://x.com/a",
    );
    expect(safeInternalPath("/today")).toBe("/today");
  });

  it("rejects open redirects", () => {
    expect(safeInternalPath("//evil.example")).toBe(PWA_START_URL);
    expect(safeInternalPath("https://evil.example")).toBe(PWA_START_URL);
    expect(safeInternalPath(undefined)).toBe(PWA_START_URL);
  });
});
