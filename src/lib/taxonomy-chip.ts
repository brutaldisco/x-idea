import { infoTypeLabel } from "@/server/ai/info-types";

export type TaxonomyChipItem = {
  id: string;
  name: string;
  color?: string | null;
};

export type TaxonomyChip = {
  name: string;
  color: string | null;
};

export function taxonomyChip(
  id: string | null | undefined,
  items: TaxonomyChipItem[],
  kind: "category" | "info_type" = "category",
): TaxonomyChip | null {
  if (!id) {
    return null;
  }
  const row = items.find((item) => item.id === id);
  return {
    name: kind === "info_type" ? infoTypeLabel(id, items) : (row?.name ?? id),
    color: row?.color ?? null,
  };
}
