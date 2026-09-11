import { afterEach, describe, expect, it } from "vitest";
import {
  applyLibraryScroll,
  beginLibraryLeave,
  beginLibraryRestore,
  cancelLibraryRestore,
  canRestoreLibraryScroll,
  consumeLibraryReturn,
  isLibraryHref,
  isLibraryRestoreCancelled,
  keepSavedScrollY,
  libraryHref,
  libraryScrollKey,
  markLibraryReturn,
  parseLibraryHref,
  parseLibraryScroll,
  parseLibraryVisit,
  peekLibraryReturn,
  resetLibraryScrollLocks,
  shouldRetryLibraryRestore,
  sourceIdFromHref,
  writeLibraryVisit,
} from "@/lib/library-scroll";

const STORAGE_KEY = "x-idea.library.scroll";

afterEach(() => {
  resetLibraryScrollLocks();
  try {
    sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
});

describe("library scroll", () => {
  it("namespaces by sort, filters, and view", () => {
    expect(
      libraryScrollKey({
        sort: "posted_desc",
        filters: "{}",
        view: "grid",
      }),
    ).toBe("posted_desc|{}|grid");
  });

  it("reads a matching saved offset", () => {
    expect(parseLibraryScroll(JSON.stringify({ key: "a", y: 420 }), "a")).toBe(
      420,
    );
    expect(parseLibraryScroll(JSON.stringify({ key: "a", y: 420 }), "b")).toBe(
      null,
    );
    expect(
      parseLibraryScroll(
        JSON.stringify({ key: "a", y: 420, href: "/library?sort=posted_asc" }),
        "b",
        "/library?sort=posted_asc",
      ),
    ).toBe(420);
    expect(parseLibraryScroll("nope", "a")).toBe(null);
  });

  it("keeps the last library query string", () => {
    expect(libraryHref("sort=posted_asc")).toBe("/library?sort=posted_asc");
    expect(libraryHref("")).toBe("/library");
    expect(isLibraryHref("/library?view=list")).toBe(true);
    expect(isLibraryHref("/today")).toBe(false);
    expect(
      parseLibraryHref(JSON.stringify({ href: "/library?sort=posted_asc" })),
    ).toBe("/library?sort=posted_asc");
    expect(parseLibraryHref(JSON.stringify({ href: "/today" }))).toBe(null);
  });

  it("waits until the document is tall enough", () => {
    expect(canRestoreLibraryScroll(900, 400, 700)).toBe(false);
    expect(canRestoreLibraryScroll(900, 1600, 700)).toBe(true);
  });

  it("parses the last opened source", () => {
    expect(
      parseLibraryVisit(
        JSON.stringify({
          key: "a",
          href: "/library",
          y: 880,
          sourceId: "01SRC",
          offset: 120,
          pageCount: 3,
        }),
      ),
    ).toEqual({
      key: "a",
      href: "/library",
      y: 880,
      sourceId: "01SRC",
      offset: 120,
      pageCount: 3,
    });
    expect(sourceIdFromHref("/source/01ABC?x=1")).toBe("01ABC");
  });

  it("does not replace a saved offset with 0 while restoring or leaving", () => {
    expect(keepSavedScrollY(0, 900)).toBe(false);
    beginLibraryRestore();
    expect(keepSavedScrollY(0, 900)).toBe(true);
    expect(keepSavedScrollY(640, 900)).toBe(false);
    beginLibraryLeave();
    expect(keepSavedScrollY(3, 1200)).toBe(true);
  });

  it("does not retry restore after success or user scroll", () => {
    expect(
      shouldRetryLibraryRestore({ restored: false, userMoved: false }),
    ).toBe(true);
    expect(
      shouldRetryLibraryRestore({ restored: true, userMoved: false }),
    ).toBe(false);
    expect(
      shouldRetryLibraryRestore({ restored: false, userMoved: true }),
    ).toBe(false);
  });

  it("stops the restore lock after the user cancels", () => {
    beginLibraryRestore();
    expect(keepSavedScrollY(0, 900)).toBe(true);
    cancelLibraryRestore();
    expect(isLibraryRestoreCancelled()).toBe(true);
    expect(keepSavedScrollY(0, 900)).toBe(false);
  });

  it("remembers a return from a source only once", () => {
    expect(peekLibraryReturn()).toBe(false);
    markLibraryReturn();
    expect(peekLibraryReturn()).toBe(true);
    expect(consumeLibraryReturn()).toBe(true);
    expect(peekLibraryReturn()).toBe(false);
  });
});

describe("library scroll storage", () => {
  it("keeps the previous Y when a locked write is 0", () => {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    writeLibraryVisit({
      key: "a",
      href: "/library?sort=posted_asc",
      y: 900,
    });
    beginLibraryRestore();
    writeLibraryVisit({
      key: "a",
      href: "/library?sort=posted_asc",
      y: 0,
    });
    expect(parseLibraryVisit(sessionStorage.getItem(STORAGE_KEY))?.y).toBe(900);
  });
});

describe("apply library scroll", () => {
  it("clamps to the current document", () => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    expect(applyLibraryScroll(0)).toBe(true);
  });
});
