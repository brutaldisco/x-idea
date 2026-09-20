import { describe, expect, it } from "vitest";
import { VIDEO_LEASE_STALE_MS } from "./video-download-plan";
import {
  canShowSaveVideosMenu,
  canTakeOverVideoDownload,
  isOtherTabVideoDownload,
  isResumableVideoQueueStatus,
  isVideoLeaseStale,
  isVideoSourceGoneError,
  mediaHasQueueableVideos,
  parseDbUtcMs,
  shouldArmVideoStallWatchdog,
  shouldSendVideoHeartbeat,
  sourceVideosQueueMessage,
  tallySourceVideoQueue,
  videoDownloadLockName,
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

describe("isResumableVideoQueueStatus", () => {
  it("takes queued items and stalled downloads, but not live ones", () => {
    expect(isResumableVideoQueueStatus("queued", false)).toBe(true);
    expect(isResumableVideoQueueStatus("downloading", false)).toBe(true);
    expect(isResumableVideoQueueStatus("downloading", true)).toBe(false);
    expect(isResumableVideoQueueStatus("ready", false)).toBe(false);
  });

  it("lets failed items resume from their saved progress", () => {
    expect(isResumableVideoQueueStatus("failed", false)).toBe(true);
    expect(isResumableVideoQueueStatus("failed", true)).toBe(true);
  });
});

describe("canTakeOverVideoDownload / isOtherTabVideoDownload", () => {
  it("lets the tab that holds the browser lock take over a live lease", () => {
    expect(
      canTakeOverVideoDownload({
        status: "downloading",
        active: false,
        leaseStale: false,
        ownsBrowserLock: true,
      }),
    ).toBe(true);
    expect(
      isOtherTabVideoDownload({
        status: "downloading",
        hasLocalProgress: false,
        leaseStale: false,
        ownsBrowserLock: true,
      }),
    ).toBe(false);
  });

  it("keeps a live lease as another tab when this tab has no lock", () => {
    expect(
      canTakeOverVideoDownload({
        status: "downloading",
        active: false,
        leaseStale: false,
        ownsBrowserLock: false,
      }),
    ).toBe(false);
    expect(
      isOtherTabVideoDownload({
        status: "downloading",
        hasLocalProgress: false,
        leaseStale: false,
        ownsBrowserLock: false,
      }),
    ).toBe(true);
  });

  it("still treats a stale lease as take-overable without the lock", () => {
    expect(
      canTakeOverVideoDownload({
        status: "downloading",
        active: false,
        leaseStale: true,
        ownsBrowserLock: false,
      }),
    ).toBe(true);
  });

  it("namespaces the browser lock by account", () => {
    expect(videoDownloadLockName("acc_1")).toBe("x-idea-video-dl:acc_1");
  });
});

describe("parseDbUtcMs", () => {
  it("parses sqlite datetime('now') format as UTC", () => {
    expect(parseDbUtcMs("2026-09-15 13:53:16")).toBe(
      Date.parse("2026-09-15T13:53:16Z"),
    );
  });

  it("accepts ISO text and rejects garbage", () => {
    expect(parseDbUtcMs("2026-09-15T13:53:16Z")).toBe(
      Date.parse("2026-09-15T13:53:16Z"),
    );
    expect(parseDbUtcMs("not a date")).toBeNull();
  });
});

describe("isVideoLeaseStale", () => {
  const now = Date.parse("2026-09-15T14:00:00Z");

  it("treats missing heartbeat (pre-feature rows) as stale", () => {
    expect(isVideoLeaseStale(null, now)).toBe(true);
  });

  it("treats fresh heartbeat as live and old one as stale", () => {
    expect(isVideoLeaseStale("2026-09-15 13:59:30", now)).toBe(false);
    const old = now - VIDEO_LEASE_STALE_MS - 1;
    const text = new Date(old).toISOString().slice(0, 19).replace("T", " ");
    expect(isVideoLeaseStale(text, now)).toBe(true);
  });

  it("treats unparsable timestamps as stale so they can be resumed", () => {
    expect(isVideoLeaseStale("???", now)).toBe(true);
  });
});

describe("shouldSendVideoHeartbeat", () => {
  it("does not send a 0-byte first beat (start already established the lease)", () => {
    expect(shouldSendVideoHeartbeat(-1, 0)).toBe(false);
    expect(shouldSendVideoHeartbeat(0, 0)).toBe(false);
  });

  it("sends only when received bytes changed since the last sent beat", () => {
    expect(shouldSendVideoHeartbeat(0, 1024)).toBe(true);
    expect(shouldSendVideoHeartbeat(1024, 1024)).toBe(false);
    // レジューム位置の巻き戻し（取り直し）も変化なので送る
    expect(shouldSendVideoHeartbeat(1024, 512)).toBe(true);
  });
});

describe("shouldArmVideoStallWatchdog", () => {
  it("does not arm on the resume cursor snapshot", () => {
    expect(shouldArmVideoStallWatchdog(0, 4_328_521_728)).toBe(false);
    expect(shouldArmVideoStallWatchdog(0, 16_384)).toBe(false);
  });

  it("arms only when new bytes arrive after the cursor is known", () => {
    expect(shouldArmVideoStallWatchdog(4_328_521_728, 4_328_538_112)).toBe(
      true,
    );
    expect(shouldArmVideoStallWatchdog(4_328_521_728, 4_328_521_728)).toBe(
      false,
    );
  });
});

describe("isVideoSourceGoneError", () => {
  it("detects 404 failures only", () => {
    expect(isVideoSourceGoneError("download failed (404)")).toBe(true);
    expect(isVideoSourceGoneError("direct range failed (404)")).toBe(true);
    expect(isVideoSourceGoneError("download failed (500)")).toBe(false);
    expect(isVideoSourceGoneError("network error")).toBe(false);
    expect(isVideoSourceGoneError(null)).toBe(false);
    expect(isVideoSourceGoneError(undefined)).toBe(false);
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
