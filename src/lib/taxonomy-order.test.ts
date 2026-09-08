import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  isSameIdSet,
  moveTaxonomyItem,
  taxonomySortOrders,
} from "@/lib/taxonomy-order";

describe("taxonomy order", () => {
  it("moves an item to the target index", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(moveTaxonomyItem(items, "a", "c").map((row) => row.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(moveTaxonomyItem(items, "c", "a").map((row) => row.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(moveTaxonomyItem(items, "a", "a")).toBe(items);
  });

  it("accepts a permutation and assigns spaced sort orders", () => {
    expect(isSameIdSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(isSameIdSet(["a", "b"], ["a"])).toBe(false);
    expect(isSameIdSet(["a", "b"], ["a", "a"])).toBe(false);
    expect(taxonomySortOrders(["a", "b"], ["b", "a"])).toEqual([
      { itemId: "b", sortOrder: 10 },
      { itemId: "a", sortOrder: 20 },
    ]);
  });

  it("rejects a list that is not the same set", () => {
    expect(() => taxonomySortOrders(["a", "b"], ["a", "c"])).toThrow(AppError);
  });
});
