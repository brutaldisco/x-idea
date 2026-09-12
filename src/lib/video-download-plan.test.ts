import { describe, expect, it } from "vitest";
import {
  initialVideoDownloadPlan,
  tuneVideoDownloadPlan,
  VIDEO_CHUNK_MAX,
  VIDEO_CHUNK_MIN,
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
