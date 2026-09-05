import { describe, expect, it } from "vitest";
import {
  ftsAndQuery,
  graphemeLength,
  isShortTerm,
  likePattern,
  normalizeSearchQuery,
  partitionSearchTerms,
  splitSearchTerms,
} from "./search-query";

describe("search query", () => {
  it("splits and trims", () => {
    expect(splitSearchTerms("  注意   経済 ")).toEqual(["注意", "経済"]);
  });

  it("treats 2-character Japanese as short, 3–4 as FTS", () => {
    expect(graphemeLength("注意")).toBe(2);
    expect(isShortTerm("注意")).toBe(true);
    expect(isShortTerm("経済")).toBe(true);
    expect(isShortTerm("注意力")).toBe(false);
    expect(isShortTerm("ナレッジ")).toBe(false);
  });

  it("builds an AND FTS query and LIKE pattern", () => {
    expect(ftsAndQuery(["注意力", 'a"b'])).toBe('"注意力" AND "a""b"');
    expect(likePattern("注意")).toBe("%注意%");
  });

  it("partitions mixed queries", () => {
    expect(partitionSearchTerms("注意 ナレッジ")).toEqual({
      fts: ["ナレッジ"],
      like: ["注意"],
    });
  });

  it("caps length", () => {
    expect(normalizeSearchQuery("あ".repeat(200)).length).toBe(80);
  });
});
