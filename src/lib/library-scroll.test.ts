import { describe, expect, it } from "vitest";
import {
  canRestoreLibraryScroll,
  libraryScrollKey,
  parseLibraryScroll,
} from "@/lib/library-scroll";

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
    expect(parseLibraryScroll("nope", "a")).toBe(null);
  });

  it("waits until the document is tall enough", () => {
    expect(canRestoreLibraryScroll(900, 400, 700)).toBe(false);
    expect(canRestoreLibraryScroll(900, 1600, 700)).toBe(true);
  });
});
