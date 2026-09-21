import { describe, expect, it } from "vitest";
import {
  APP_SHELL_WIDE_GRID_CLASS,
  LIBRARY_WIDE_STORAGE_KEY,
  libraryGridClass,
  libraryShellMaxWidthClass,
  videosGridClass,
  WIDE_MEDIA_GRID_CLASS,
  wideGridShellActive,
} from "./library-layout";

describe("library layout", () => {
  it("uses a stable storage key", () => {
    expect(LIBRARY_WIDE_STORAGE_KEY).toBe("x-idea-library-wide");
  });

  it("builds grid classes for default and wide modes", () => {
    expect(libraryGridClass("grid", false)).toContain("grid-cols-3");
    expect(libraryGridClass("grid", true)).toContain(WIDE_MEDIA_GRID_CLASS);
    expect(libraryGridClass("list", true)).toContain("grid-cols-1");
    expect(videosGridClass(false)).toContain("grid-cols-3");
    expect(videosGridClass(true)).toContain(WIDE_MEDIA_GRID_CLASS);
  });

  it("activates the wide shell only on library grid or videos", () => {
    expect(
      wideGridShellActive({
        wideEnabled: true,
        onLibraryGrid: true,
        onVideos: false,
      }),
    ).toBe(true);
    expect(
      wideGridShellActive({
        wideEnabled: true,
        onLibraryGrid: false,
        onVideos: true,
      }),
    ).toBe(true);
    expect(
      wideGridShellActive({
        wideEnabled: true,
        onLibraryGrid: false,
        onVideos: false,
      }),
    ).toBe(false);
  });

  it("uses responsive shell class instead of stretching cards", () => {
    expect(
      libraryShellMaxWidthClass({
        readerOpen: false,
        wideProp: false,
        wideGridActive: true,
      }),
    ).toContain(APP_SHELL_WIDE_GRID_CLASS);
    expect(
      libraryShellMaxWidthClass({
        readerOpen: false,
        wideProp: false,
        wideGridActive: false,
      }),
    ).toContain("max-w-3xl");
  });
});
