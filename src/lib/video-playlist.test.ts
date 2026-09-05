import { describe, expect, it } from "vitest";
import {
  folderPlaylist,
  parseRepeatMode,
  stepPlaylist,
} from "./video-playlist";

const library = [
  { id: "a", folderId: "f1" },
  { id: "b", folderId: "f1" },
  { id: "c", folderId: null },
  { id: "d", folderId: "f2" },
];

describe("folderPlaylist", () => {
  it("keeps videos in the same folder, including unclassified", () => {
    expect(folderPlaylist(library, library[0]).map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
    expect(folderPlaylist(library, library[2]).map((row) => row.id)).toEqual([
      "c",
    ]);
  });
});

describe("stepPlaylist", () => {
  it("wraps around the folder", () => {
    const list = folderPlaylist(library, library[0]);
    expect(stepPlaylist(list, "a", 1)?.id).toBe("b");
    expect(stepPlaylist(list, "b", 1)?.id).toBe("a");
    expect(stepPlaylist(list, "b", -1)?.id).toBe("a");
  });
});

describe("parseRepeatMode", () => {
  it("defaults to folder loop", () => {
    expect(parseRepeatMode(null)).toBe("folder");
    expect(parseRepeatMode("one")).toBe("one");
  });
});
