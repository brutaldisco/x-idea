import { describe, expect, it } from "vitest";
import {
  clampSourceLimit,
  clampSourcePage,
  decodeSourceCursor,
  encodeSourceCursor,
  libraryPageSlots,
  SOURCE_PAGE_SIZE,
  sourceCursorKey,
  sourceCursorSql,
  sourcePageCount,
  sourcePageOffset,
  withLibraryPage,
} from "@/lib/source-cursor";

describe("source cursor", () => {
  it("round-trips key and id", () => {
    const raw = encodeSourceCursor("2026-09-06 12:00:00", "src_1");
    expect(decodeSourceCursor(raw)).toEqual({
      key: "2026-09-06 12:00:00",
      id: "src_1",
    });
    expect(decodeSourceCursor("bad")).toBeNull();
    expect(decodeSourceCursor("")).toBeNull();
  });

  it("clamps page size and builds a keyset predicate", () => {
    expect(SOURCE_PAGE_SIZE).toBe(60);
    expect(clampSourceLimit(undefined)).toBe(SOURCE_PAGE_SIZE);
    expect(clampSourceLimit("200")).toBe(100);
    expect(clampSourceLimit("0")).toBe(1);
    expect(clampSourcePage(undefined)).toBe(1);
    expect(clampSourcePage("0")).toBe(1);
    expect(clampSourcePage("3")).toBe(3);
    expect(sourcePageOffset(1)).toBe(0);
    expect(sourcePageOffset(2)).toBe(60);
    expect(sourcePageCount(0)).toBe(1);
    expect(sourcePageCount(60)).toBe(1);
    expect(sourcePageCount(61)).toBe(2);
    expect(withLibraryPage("sort=posted_asc&page=3", 1)).toBe(
      "sort=posted_asc",
    );
    expect(withLibraryPage("", 2)).toBe("page=2");
    expect(sourceCursorSql("posted_desc")).toContain("< ?");
    expect(sourceCursorSql("posted_desc")).toContain("s.id > ?");
    expect(sourceCursorSql("posted_asc")).toContain("> ?");
    expect(sourceCursorSql("posted_asc")).toContain("s.id < ?");
    expect(sourceCursorSql("video_saved")).toContain("vd.status = 'ready'");
    expect(sourceCursorSql("video_saved")).toContain("< ?");
  });

  it("uses saved_at for bookmark-time sorts", () => {
    const item = { postedAt: "2026-01-01", savedAt: "2026-02-02" };
    expect(sourceCursorKey(item, "posted_desc")).toBe("2026-02-02");
    expect(sourceCursorKey(item, "posted_asc")).toBe("2026-02-02");
    expect(
      sourceCursorKey({ ...item, videoSaveStatus: "ready" }, "video_saved"),
    ).toBe("1|2026-02-02");
    expect(sourceCursorKey(item, "video_saved")).toBe("0|2026-02-02");
  });

  it("builds compact page slots with gaps", () => {
    expect(libraryPageSlots(1, 4)).toEqual([1, 2, 3, 4]);
    expect(libraryPageSlots(1, 10)).toEqual([1, 2, "gap", 10]);
    expect(libraryPageSlots(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    expect(libraryPageSlots(10, 10)).toEqual([1, "gap", 9, 10]);
  });
});
