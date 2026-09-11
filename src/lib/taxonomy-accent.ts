export const TAXONOMY_ACCENT_IDS = [
  "accent-01",
  "accent-02",
  "accent-03",
  "accent-04",
  "accent-05",
  "accent-06",
  "accent-07",
  "accent-08",
  "accent-09",
] as const;

export type TaxonomyAccentId = (typeof TAXONOMY_ACCENT_IDS)[number];

const ACCENT_IDS = new Set<string>(TAXONOMY_ACCENT_IDS);

export function isTaxonomyAccentId(value: string): value is TaxonomyAccentId {
  return ACCENT_IDS.has(value);
}

export const TAXONOMY_ACCENT_CLASSES: Record<
  TaxonomyAccentId,
  { bg: string; ink: string }
> = {
  "accent-01": { bg: "bg-accent-01", ink: "text-accent-01-ink" },
  "accent-02": { bg: "bg-accent-02", ink: "text-accent-02-ink" },
  "accent-03": { bg: "bg-accent-03", ink: "text-accent-03-ink" },
  "accent-04": { bg: "bg-accent-04", ink: "text-accent-04-ink" },
  "accent-05": { bg: "bg-accent-05", ink: "text-accent-05-ink" },
  "accent-06": { bg: "bg-accent-06", ink: "text-accent-06-ink" },
  "accent-07": { bg: "bg-accent-07", ink: "text-accent-07-ink" },
  "accent-08": { bg: "bg-accent-08", ink: "text-accent-08-ink" },
  "accent-09": { bg: "bg-accent-09", ink: "text-accent-09-ink" },
};

export function taxonomyAccentClass(color: string | null | undefined): string {
  if (!color || !isTaxonomyAccentId(color)) {
    return "";
  }
  const tone = TAXONOMY_ACCENT_CLASSES[color];
  return `${tone.bg} ${tone.ink}`;
}

export function nextTaxonomyAccent(
  used: Array<string | null | undefined>,
): TaxonomyAccentId {
  const taken = new Set(
    used.filter((value): value is string => Boolean(value)),
  );
  return (
    TAXONOMY_ACCENT_IDS.find((id) => !taken.has(id)) ??
    TAXONOMY_ACCENT_IDS[used.length % TAXONOMY_ACCENT_IDS.length]
  );
}
