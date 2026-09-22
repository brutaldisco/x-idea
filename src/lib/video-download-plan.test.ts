import { describe, expect, it } from "vitest";
import {
  DIRECT_CHUNK_MAX,
  DIRECT_PARALLEL,
  directChunkBytes,
  initialVideoDownloadPlan,
  nextTailSidecarFetch,
  shouldAvoidProxyFallback,
  shouldUseVideoTailSidecar,
  tuneVideoDownloadPlan,
  VIDEO_CHUNK_MAX,
  VIDEO_CHUNK_MIN,
  VIDEO_LARGE_RESUME_BYTES,
  VIDEO_OPEN_TIMEOUT_MAX_MS,
  VIDEO_OPEN_TIMEOUT_MS,
  videoFileSourceRange,
  videoOpenTimeoutMs,
} from "./video-download-plan";

describe("video download plan", () => {
  it("starts conservative without a hint", () => {
    expect(initialVideoDownloadPlan(null)).toEqual({
      chunkBytes: 8 * 1024 * 1024,
      parallel: 1,
      retries: 3,
    });
  });

  it("keeps huge files on a small chunk without a hint", () => {
    expect(initialVideoDownloadPlan(500 * 1024 * 1024)).toEqual({
      chunkBytes: 4 * 1024 * 1024,
      parallel: 1,
      retries: 4,
    });
  });

  it("grows the chunk on a fast measured line", () => {
    const plan = tuneVideoDownloadPlan(
      { chunkBytes: 8 * 1024 * 1024, parallel: 1, retries: 3 },
      20 * 1024 * 1024,
    );
    expect(plan.chunkBytes).toBe(16 * 1024 * 1024);
    expect(plan.parallel).toBe(2);
  });

  it("shrinks the chunk on a slow measured line", () => {
    const plan = tuneVideoDownloadPlan(
      { chunkBytes: 8 * 1024 * 1024, parallel: 3, retries: 3 },
      300 * 1024,
    );
    expect(plan.chunkBytes).toBe(4 * 1024 * 1024);
    expect(plan.parallel).toBe(1);
  });

  it("stays within chunk bounds", () => {
    const slow = tuneVideoDownloadPlan(
      { chunkBytes: VIDEO_CHUNK_MIN, parallel: 1, retries: 5 },
      10 * 1024,
    );
    expect(slow.chunkBytes).toBe(2 * VIDEO_CHUNK_MIN);
    const fast = tuneVideoDownloadPlan(
      { chunkBytes: VIDEO_CHUNK_MAX, parallel: 4, retries: 2 },
      100 * 1024 * 1024,
    );
    expect(fast.chunkBytes).toBe(VIDEO_CHUNK_MAX);
  });
});

describe("directChunkBytes", () => {
  it("caps huge files at the direct chunk max", () => {
    expect(directChunkBytes(2_405_869_896)).toBe(DIRECT_CHUNK_MAX);
  });

  it("splits small files so every worker gets a chunk", () => {
    const chunk = directChunkBytes(20 * 1024 * 1024);
    expect(chunk).toBe(5 * 1024 * 1024);
    expect(chunk * DIRECT_PARALLEL).toBeGreaterThanOrEqual(20 * 1024 * 1024);
  });

  it("never goes below the minimum chunk", () => {
    expect(directChunkBytes(1024)).toBe(VIDEO_CHUNK_MIN);
  });

  it("falls back to the max when total is unknown", () => {
    expect(directChunkBytes(0)).toBe(DIRECT_CHUNK_MAX);
  });
});

describe("videoOpenTimeoutMs", () => {
  it("keeps the base timeout for a new file", () => {
    expect(videoOpenTimeoutMs(0)).toBe(VIDEO_OPEN_TIMEOUT_MS);
    expect(videoOpenTimeoutMs()).toBe(VIDEO_OPEN_TIMEOUT_MS);
  });

  it("extends the timeout for multi-gigabyte resume files", () => {
    const fourGig = 4 * 1024 * 1024 * 1024;
    expect(videoOpenTimeoutMs(fourGig)).toBeGreaterThan(VIDEO_OPEN_TIMEOUT_MS);
    expect(videoOpenTimeoutMs(fourGig)).toBeLessThanOrEqual(
      VIDEO_OPEN_TIMEOUT_MAX_MS,
    );
  });
});

describe("shouldAvoidProxyFallback", () => {
  it("skips proxy fallback for large in-progress files", () => {
    expect(shouldAvoidProxyFallback(0)).toBe(false);
    expect(shouldAvoidProxyFallback(64 * 1024 * 1024)).toBe(false);
    expect(shouldAvoidProxyFallback(VIDEO_LARGE_RESUME_BYTES)).toBe(true);
    expect(shouldAvoidProxyFallback(4 * 1024 * 1024 * 1024)).toBe(true);
  });
});

describe("shouldUseVideoTailSidecar", () => {
  it("uses a sidecar only after the large-resume threshold", () => {
    expect(shouldUseVideoTailSidecar(0)).toBe(false);
    expect(shouldUseVideoTailSidecar(VIDEO_LARGE_RESUME_BYTES - 1)).toBe(false);
    expect(shouldUseVideoTailSidecar(VIDEO_LARGE_RESUME_BYTES)).toBe(true);
    expect(shouldUseVideoTailSidecar(4 * 1024 * 1024 * 1024)).toBe(true);
  });
});

describe("nextTailSidecarFetch", () => {
  it("refreshes the direct URL a few times, then falls through to sequential", () => {
    expect(
      nextTailSidecarFetch({
        mode: "direct",
        directFailures: 0,
        gotFreshUrl: true,
      }),
    ).toEqual({ mode: "direct", directFailures: 1, giveUp: false });
    expect(
      nextTailSidecarFetch({
        mode: "direct",
        directFailures: 2,
        gotFreshUrl: true,
      }),
    ).toEqual({ mode: "sequential", directFailures: 3, giveUp: false });
  });

  it("does not stay on direct when the URL cannot be refreshed", () => {
    expect(
      nextTailSidecarFetch({
        mode: "direct",
        directFailures: 0,
        gotFreshUrl: false,
      }).mode,
    ).toBe("sequential");
  });

  it("gives up after sequential fails instead of looping forever", () => {
    expect(
      nextTailSidecarFetch({
        mode: "sequential",
        directFailures: 3,
        gotFreshUrl: true,
      }).giveUp,
    ).toBe(true);
  });
});

describe("videoFileSourceRange", () => {
  it("keeps file offsets when the sidecar starts at the CDN origin", () => {
    expect(videoFileSourceRange(0, 8 * 1024 * 1024 - 1)).toEqual({
      start: 0,
      end: 8 * 1024 * 1024 - 1,
    });
  });

  it("maps sidecar file offsets onto the remaining CDN range", () => {
    const mainOffset = 4_328_521_728;
    expect(videoFileSourceRange(0, 8 * 1024 * 1024 - 1, mainOffset)).toEqual({
      start: mainOffset,
      end: mainOffset + 8 * 1024 * 1024 - 1,
    });
  });
});
