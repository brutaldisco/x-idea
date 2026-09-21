import { describe, expect, it } from "vitest";
import { parseSourceSort, sourceSortSql } from "./source-sort";

describe("parseSourceSort", () => {
  it("defaults to newest bookmarked and accepts known ids", () => {
    expect(parseSourceSort(undefined)).toBe("posted_desc");
    expect(parseSourceSort("posted_asc")).toBe("posted_asc");
    expect(parseSourceSort("saved_asc")).toBe("posted_asc");
    expect(parseSourceSort("video_saved")).toBe("video_saved");
    expect(parseSourceSort("video_unsaved")).toBe("video_unsaved");
    expect(parseSourceSort("drop table")).toBe("posted_desc");
  });
});

describe("sourceSortSql", () => {
  it("uses saved_at as the X bookmark-time stand-in", () => {
    expect(sourceSortSql("posted_desc")).toContain("s.saved_at DESC");
    expect(sourceSortSql("posted_desc")).toContain("s.id ASC");
    expect(sourceSortSql("posted_asc")).toContain("s.saved_at ASC");
    expect(sourceSortSql("posted_asc")).toContain("s.id DESC");
    expect(sourceSortSql("video_saved")).toContain("vd.status = 'ready'");
    expect(sourceSortSql("video_saved")).toContain("s.saved_at DESC");
    expect(sourceSortSql("video_unsaved")).toContain(
      "m.type IN ('video', 'animated_gif')",
    );
    expect(sourceSortSql("video_unsaved")).toContain("vd.status = 'ready'");
    expect(sourceSortSql("video_unsaved")).toContain("s.saved_at DESC");
  });
});
