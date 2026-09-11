import { describe, expect, it } from "vitest";
import {
  canShowSaveVideosMenu,
  mediaHasQueueableVideos,
  sourceVideosQueueMessage,
  tallySourceVideoQueue,
} from "./video-queue";

describe("canShowSaveVideosMenu", () => {
  it("is only for posts that still have videos to queue", () => {
    expect(
      canShowSaveVideosMenu({ kind: "x_post", hasQueueableVideos: true }),
    ).toBe(true);
    expect(
      canShowSaveVideosMenu({ kind: "article", hasQueueableVideos: true }),
    ).toBe(false);
    expect(
      canShowSaveVideosMenu({ kind: "x_post", hasQueueableVideos: false }),
    ).toBe(false);
  });
});

describe("mediaHasQueueableVideos", () => {
  it("ignores photos and already queued or saved videos", () => {
    expect(
      mediaHasQueueableVideos([
        { type: "photo" },
        { type: "video", videoSaveStatus: "ready" },
        { type: "animated_gif", videoSaveStatus: "queued" },
      ]),
    ).toBe(false);
    expect(
      mediaHasQueueableVideos([
        { type: "photo" },
        { type: "video", videoSaveStatus: null },
      ]),
    ).toBe(true);
  });
});

describe("source video queue tally", () => {
  it("counts leftover items as full when the queue fills mid-way", () => {
    expect(tallySourceVideoQueue(["queued", "full"], 2)).toEqual({
      queued: 1,
      skippedReady: 0,
      skippedQueued: 0,
      skippedFull: 3,
      failed: 0,
    });
  });

  it("explains mixed results", () => {
    expect(
      sourceVideosQueueMessage({
        queued: 2,
        skippedReady: 1,
        skippedQueued: 0,
        skippedFull: 0,
        failed: 0,
      }),
    ).toBe("2件を追加、1件は保存済み。");
    expect(
      sourceVideosQueueMessage({
        queued: 3,
        skippedReady: 0,
        skippedQueued: 0,
        skippedFull: 0,
        failed: 0,
      }),
    ).toBe("3件をキューに追加しました。Videos タブで保存できます。");
  });
});
