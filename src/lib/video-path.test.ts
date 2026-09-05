import { describe, expect, it } from "vitest";
import {
  isSafeVideoRelPath,
  parseVideoRelPath,
  sanitizeFolderName,
  VIDEO_QUEUE_MAX,
  videoFileName,
  videoRelPath,
} from "./video-path";

describe("videoRelPath", () => {
  it("puts unclassified videos under the account folder", () => {
    expect(
      videoRelPath({
        accountId: "acc_1",
        tweetId: "2001",
        mediaKey: "3_111",
      }),
    ).toBe("acc_1/2001_3_111.mp4");
  });

  it("nests classified videos one folder deep", () => {
    expect(
      videoRelPath({
        accountId: "acc_1",
        folderName: "講義",
        tweetId: "2001",
        mediaKey: "3_111",
      }),
    ).toBe("acc_1/講義/2001_3_111.mp4");
  });
});

describe("sanitizeFolderName / isSafeVideoRelPath", () => {
  it("rejects empty and traversal names", () => {
    expect(() => sanitizeFolderName("  ")).toThrow("folder name empty");
    expect(sanitizeFolderName("a/b")).toBe("ab");
    expect(isSafeVideoRelPath("../secret.mp4")).toBe(false);
    expect(isSafeVideoRelPath("acc/ok.mp4")).toBe(true);
    expect(isSafeVideoRelPath("acc/講義/ok.mp4")).toBe(true);
  });

  it("parses relative paths", () => {
    expect(parseVideoRelPath("acc/2001_k.mp4")).toEqual({
      accountId: "acc",
      folderName: null,
      fileName: "2001_k.mp4",
    });
    expect(videoFileName("2001", "k")).toBe("2001_k.mp4");
    expect(VIDEO_QUEUE_MAX).toBe(15);
  });
});
