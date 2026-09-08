import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import {
  dragTargetIndex,
  isSameIdSet,
  moveTaxonomyItem,
  moveTaxonomyItemToIndex,
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

  it("moves an item to an index", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(moveTaxonomyItemToIndex(items, "a", 2).map((row) => row.id)).toEqual(
      ["b", "c", "a"],
    );
    expect(moveTaxonomyItemToIndex(items, "c", 0).map((row) => row.id)).toEqual(
      ["c", "a", "b"],
    );
    expect(moveTaxonomyItemToIndex(items, "b", 1)).toBe(items);
    expect(
      moveTaxonomyItemToIndex(items, "a", 99).map((row) => row.id),
    ).toEqual(["b", "c", "a"]);
  });

  it("picks the insert index from the other rows' midpoints", () => {
    expect(dragTargetIndex(10, [])).toBe(0);
    expect(dragTargetIndex(40, [50, 150, 250])).toBe(0);
    expect(dragTargetIndex(160, [50, 150, 250])).toBe(2);
    expect(dragTargetIndex(400, [50, 150, 250])).toBe(3);
  });
});
