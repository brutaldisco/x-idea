import { describe, expect, it } from "vitest";
import {
  hasLibraryFilters,
  libraryFilterSql,
  parseLibraryFilters,
  parseLibraryView,
} from "@/lib/source-filters";

describe("library filters", () => {
  it("keeps known values and drops junk", () => {
    const params = new URLSearchParams(
      "kind=x_post&read=to_practice&info_type=idea&category=cat_ai",
    );
    expect(parseLibraryFilters(params)).toMatchObject({
      kind: "x_post",
      readStatus: "to_practice",
      infoType: "idea",
      categoryId: "cat_ai",
    });
    expect(
      parseLibraryFilters(new URLSearchParams("info_type=it_custom1")),
    ).toMatchObject({ infoType: "it_custom1" });
    expect(
      parseLibraryFilters(new URLSearchParams("kind=nope&read=evil")),
    ).toEqual({});
    expect(parseLibraryView("grid")).toBe("grid");
    expect(parseLibraryView("atlas")).toBe("list");
  });

  it("builds bounded SQL", () => {
    const { clause, args } = libraryFilterSql({
      kind: "x_post",
      tag: "llm",
      readStatus: "unread",
    });
    expect(clause.join(" ")).toContain("s.kind = ?");
    expect(clause.join(" ")).toContain("EXISTS");
    expect(args).toEqual(["unread", "x_post", "llm"]);
    expect(hasLibraryFilters({ kind: "note" })).toBe(true);
    expect(hasLibraryFilters({})).toBe(false);
  });
});
