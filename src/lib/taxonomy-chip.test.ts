import { describe, expect, it } from "vitest";
import { taxonomyChip } from "@/lib/taxonomy-chip";

describe("taxonomyChip", () => {
  it("resolves a category name and color", () => {
    expect(
      taxonomyChip("cat_ai", [
        { id: "cat_ai", name: "AI", color: "accent-02" },
      ]),
    ).toEqual({ name: "AI", color: "accent-02" });
  });

  it("falls back to the info-type label", () => {
    expect(taxonomyChip("idea", [], "info_type")).toEqual({
      name: "アイデア",
      color: null,
    });
  });

  it("returns null without an id", () => {
    expect(taxonomyChip(null, [])).toBeNull();
  });
});
