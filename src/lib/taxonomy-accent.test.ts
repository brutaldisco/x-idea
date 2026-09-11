import { describe, expect, it } from "vitest";
import {
  isTaxonomyAccentId,
  nextTaxonomyAccent,
  taxonomyAccentClass,
} from "@/lib/taxonomy-accent";

describe("taxonomy accent", () => {
  it("accepts the accent scale and fills the next unused color", () => {
    expect(isTaxonomyAccentId("accent-03")).toBe(true);
    expect(isTaxonomyAccentId("accent-10")).toBe(false);
    expect(nextTaxonomyAccent(["accent-01", "accent-02"])).toBe("accent-03");
    expect(
      nextTaxonomyAccent([
        "accent-01",
        "accent-02",
        "accent-03",
        "accent-04",
        "accent-05",
        "accent-06",
        "accent-07",
        "accent-08",
        "accent-09",
      ]),
    ).toBe("accent-01");
    expect(taxonomyAccentClass("accent-04")).toBe(
      "bg-accent-04 text-accent-04-ink",
    );
    expect(taxonomyAccentClass(null)).toBe("");
  });
});
