import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  accountMediaDir,
  isLocalMediaEnabled,
  mediaFolderHref,
  mediaRoot,
  relativeMediaPath,
  resolveMediaPath,
} from "./paths";

const prev = {
  vercel: process.env.VERCEL,
  root: process.env.MEDIA_ROOT,
};

afterEach(() => {
  if (prev.vercel === undefined) {
    delete process.env.VERCEL;
  } else {
    process.env.VERCEL = prev.vercel;
  }
  if (prev.root === undefined) {
    delete process.env.MEDIA_ROOT;
  } else {
    process.env.MEDIA_ROOT = prev.root;
  }
});

describe("isLocalMediaEnabled", () => {
  it("is off on Vercel", () => {
    process.env.VERCEL = "1";
    expect(isLocalMediaEnabled()).toBe(false);
  });

  it("is on locally by default", () => {
    delete process.env.VERCEL;
    delete process.env.MEDIA_ROOT;
    expect(isLocalMediaEnabled()).toBe(true);
  });
});

describe("relativeMediaPath / resolveMediaPath", () => {
  it("keeps a portable relative path", () => {
    expect(
      relativeMediaPath({
        accountId: "acc_1",
        tweetId: "2001",
        mediaKey: "3_111",
        ext: ".jpg",
      }),
    ).toBe("acc_1/2001/3_111.jpg");
  });

  it("rejects path traversal", () => {
    process.env.MEDIA_ROOT = "/tmp/media-root";
    expect(() => resolveMediaPath("../secret.txt")).toThrow(
      "invalid media path",
    );
    expect(resolveMediaPath("acc/2001/3_111.jpg")).toBe(
      join("/tmp/media-root", "acc/2001/3_111.jpg"),
    );
  });

  it("keeps each account in its own folder", () => {
    process.env.MEDIA_ROOT = "/tmp/media-root";
    expect(accountMediaDir("acc_a")).toBe(join("/tmp/media-root", "acc_a"));
    expect(accountMediaDir("acc_b")).toBe(join("/tmp/media-root", "acc_b"));
    expect(mediaFolderHref("acc_a")).toBe("/api/media/folder?account=acc_a");
    expect(mediaFolderHref()).toBe("/api/media/folder");
  });
});

describe("mediaRoot", () => {
  it("defaults to ./data/media", () => {
    delete process.env.MEDIA_ROOT;
    expect(mediaRoot()).toBe(join(process.cwd(), "data/media"));
  });
});
