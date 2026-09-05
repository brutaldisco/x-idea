import { describe, expect, it } from "vitest";
import {
  clampSourceLimit,
  decodeSourceCursor,
  encodeSourceCursor,
  SOURCE_PAGE_SIZE,
  sourceCursorKey,
  sourceCursorSql,
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
    expect(clampSourceLimit(undefined)).toBe(SOURCE_PAGE_SIZE);
    expect(clampSourceLimit("200")).toBe(100);
    expect(clampSourceLimit("0")).toBe(1);
    expect(sourceCursorSql("posted_desc")).toContain("< ?");
    expect(sourceCursorSql("saved_asc")).toContain("> ?");
  });

  it("uses saved_at only for saved sorts", () => {
    const item = { postedAt: "2026-01-01", savedAt: "2026-02-02" };
    expect(sourceCursorKey(item, "posted_desc")).toBe("2026-01-01");
    expect(sourceCursorKey(item, "saved_asc")).toBe("2026-02-02");
  });
});
