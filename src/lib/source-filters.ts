import type { SearchFilters } from "@/lib/search-query";
import { isTaxonomyItemId } from "@/lib/taxonomy-id";
import { READ_STATUSES } from "@/server/sources/triage";

export const SOURCE_KINDS = [
  { id: "x_post", label: "投稿" },
  { id: "article", label: "記事" },
  { id: "note", label: "手動" },
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number]["id"];
export type LibraryView = "list" | "grid";

export type LibraryFilters = SearchFilters & {
  kind?: SourceKind;
  tag?: string;
};

const KIND_IDS = new Set<string>(SOURCE_KINDS.map((item) => item.id));
const READ_IDS = new Set<string>(READ_STATUSES);

function pick(
  params: { get(name: string): string | null },
  name: string,
  max = 48,
): string | undefined {
  const value = params.get(name)?.trim();
  if (!value || value.length > max) {
    return undefined;
  }
  return value;
}

export function parseLibraryView(raw: string | undefined | null): LibraryView {
  return raw === "list" ? "list" : "grid";
}

export function parseLibraryFilters(params: {
  get(name: string): string | null;
}): LibraryFilters {
  const kind = pick(params, "kind", 16);
  const infoType = pick(params, "info_type", 24);
  const readStatus = pick(params, "read", 24);
  const tag = pick(params, "tag", 40);
  return {
    categoryId: pick(params, "category"),
    infoType: infoType && isTaxonomyItemId(infoType) ? infoType : undefined,
    triage: pick(params, "triage", 24),
    readStatus: readStatus && READ_IDS.has(readStatus) ? readStatus : undefined,
    from: pick(params, "from", 32),
    to: pick(params, "to", 32),
    kind: kind && KIND_IDS.has(kind) ? (kind as SourceKind) : undefined,
    tag,
  };
}

export function libraryFilterSql(filters: LibraryFilters): {
  clause: string[];
  args: string[];
} {
  const clause: string[] = [];
  const args: string[] = [];
  if (filters.categoryId) {
    clause.push("s.category_id = ?");
    args.push(filters.categoryId);
  }
  if (filters.infoType) {
    clause.push("s.info_type = ?");
    args.push(filters.infoType);
  }
  if (filters.triage) {
    clause.push("s.triage_status = ?");
    args.push(filters.triage);
  }
  if (filters.readStatus) {
    clause.push("s.read_status = ?");
    args.push(filters.readStatus);
  }
  if (filters.kind) {
    clause.push("s.kind = ?");
    args.push(filters.kind);
  }
  if (filters.tag) {
    clause.push(`EXISTS (
      SELECT 1 FROM source_tags st
      JOIN tags t ON t.id = st.tag_id
      WHERE st.source_id = s.id AND t.name = ?
      LIMIT 1
    )`);
    args.push(filters.tag);
  }
  if (filters.from) {
    clause.push("s.saved_at >= ?");
    args.push(filters.from);
  }
  if (filters.to) {
    clause.push("s.saved_at <= ?");
    args.push(filters.to);
  }
  return { clause, args };
}

export function hasLibraryFilters(filters: LibraryFilters): boolean {
  return Boolean(
    filters.categoryId ||
      filters.infoType ||
      filters.triage ||
      filters.readStatus ||
      filters.kind ||
      filters.tag ||
      filters.from ||
      filters.to,
  );
}
