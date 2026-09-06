import { describe, expect, it } from "vitest";
import { isTaxonomyItemId } from "@/lib/taxonomy-id";
import {
  defaultAccountTaxonomy,
  isTaxonomyKind,
  normalizeTaxonomyName,
} from "@/server/taxonomy";

describe("taxonomy helpers", () => {
  it("normalizes names and rejects unknown kinds", () => {
    expect(normalizeTaxonomyName("  社会学  ")).toBe("社会学");
    expect(normalizeTaxonomyName("あ".repeat(50)).length).toBe(40);
    expect(isTaxonomyKind("category")).toBe(true);
    expect(isTaxonomyKind("info_type")).toBe(true);
    expect(isTaxonomyKind("tag")).toBe(false);
    expect(isTaxonomyItemId("cat_ai")).toBe(true);
    expect(isTaxonomyItemId("it_01h2")).toBe(true);
    expect(isTaxonomyItemId("bad id")).toBe(false);
  });

  it("starts from the seed categories and default info types", () => {
    const defaults = defaultAccountTaxonomy();
    expect(defaults.categories.map((row) => row.name)).toContain("社会学");
    expect(defaults.infoTypes.map((row) => row.id)).toContain("idea");
  });
});
