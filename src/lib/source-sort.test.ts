import { describe, expect, it } from "vitest";
import { parseSourceSort, sourceSortSql } from "./source-sort";

describe("parseSourceSort", () => {
  it("defaults to newest posted and accepts known ids", () => {
    expect(parseSourceSort(undefined)).toBe("posted_desc");
    expect(parseSourceSort("saved_asc")).toBe("saved_asc");
    expect(parseSourceSort("drop table")).toBe("posted_desc");
  });
});

describe("sourceSortSql", () => {
  it("uses posted_at for default newest-first", () => {
    expect(sourceSortSql("posted_desc")).toContain("posted_at");
    expect(sourceSortSql("posted_desc")).toContain("DESC");
    expect(sourceSortSql("saved_asc")).toContain("s.saved_at ASC");
  });
});
