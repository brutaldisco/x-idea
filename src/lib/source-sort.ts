export const SOURCE_SORTS = [
  { id: "posted_desc", label: "新しい順" },
  { id: "posted_asc", label: "古い順" },
  { id: "saved_desc", label: "保存が新しい順" },
  { id: "saved_asc", label: "保存が古い順" },
] as const;

export type SourceSort = (typeof SOURCE_SORTS)[number]["id"];

export function parseSourceSort(raw: string | undefined | null): SourceSort {
  return SOURCE_SORTS.some((item) => item.id === raw)
    ? (raw as SourceSort)
    : "posted_desc";
}

export function sourceSortSql(sort: SourceSort): string {
  switch (sort) {
    case "posted_asc":
      return "COALESCE(p.posted_at, s.bookmarked_at, s.saved_at) ASC, s.id ASC";
    case "saved_desc":
      return "s.saved_at DESC, s.id DESC";
    case "saved_asc":
      return "s.saved_at ASC, s.id ASC";
    default:
      return "COALESCE(p.posted_at, s.bookmarked_at, s.saved_at) DESC, s.id DESC";
  }
}
