import { describe, expect, it } from "vitest";
import {
  collectSavedVideoRelPaths,
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
