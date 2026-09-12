import { describe, expect, it } from "vitest";
import {
  collectSavedVideoRelPaths,
  isFinishedVideoDownload,
  isIncompleteVideoFile,
  leftoverVideoRelPaths,
  resolveSavedVideoRelPath,
} from "./video-files";

describe("resolveSavedVideoRelPath", () => {
  it("prefers a stored safe path", () => {
    expect(
      resolveSavedVideoRelPath({
        relPath: "acc_1/folder/2001_k.mp4",
        accountId: "acc_1",
        tweetId: "2001",
        mediaKey: "k",
      }),
    ).toBe("acc_1/folder/2001_k.mp4");
  });

  it("rebuilds the path when the row has no rel_path yet", () => {
    expect(
      resolveSavedVideoRelPath({
        accountId: "acc_1",
        folderName: "講義",
        tweetId: "2001",
        mediaKey: "3_111",
      }),
    ).toBe("acc_1/講義/2001_3_111.mp4");
  });
});

describe("collectSavedVideoRelPaths", () => {
  it("dedupes and keeps the last account id", () => {
    expect(
      collectSavedVideoRelPaths([
        {
          relPath: "acc_1/2001_a.mp4",
          accountId: "acc_1",
        },
        {
          accountId: "acc_1",
          tweetId: "2002",
          mediaKey: "b",
        },
        {
          relPath: "acc_1/2001_a.mp4",
          accountId: "acc_1",
        },
      ]),
    ).toEqual({
      accountId: "acc_1",
      videoRelPaths: ["acc_1/2001_a.mp4", "acc_1/2002_b.mp4"],
    });
  });
});

describe("isFinishedVideoDownload", () => {
  it("rejects empty or short downloads", () => {
    expect(isFinishedVideoDownload(0, 100)).toBe(false);
    expect(isFinishedVideoDownload(50, 100)).toBe(false);
    expect(isFinishedVideoDownload(100, 100)).toBe(true);
    expect(isFinishedVideoDownload(80, 0)).toBe(true);
  });
});

describe("isIncompleteVideoFile", () => {
  it("treats empty or much-smaller files as broken", () => {
    expect(isIncompleteVideoFile(0, 10_000)).toBe(true);
    expect(isIncompleteVideoFile(1000, 10_000)).toBe(true);
    expect(isIncompleteVideoFile(9500, 10_000)).toBe(false);
    expect(isIncompleteVideoFile(2048, null)).toBe(false);
  });
});

describe("leftoverVideoRelPaths", () => {
  it("drops files that are still queued or saved", () => {
    expect(
      leftoverVideoRelPaths(
        ["acc/a.mp4", "acc/b.mp4", "acc/a.mp4", "acc/c.mp4"],
        ["acc/a.mp4", "acc/c.mp4"],
      ),
    ).toEqual(["acc/b.mp4"]);
  });
});
