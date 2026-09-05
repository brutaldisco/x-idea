export const SEARCH_LIMIT = 30;
export const SUGGEST_LIMIT = 8;
export const LIKE_WINDOW = 2000;
export const SHORT_TERM_MAX = 2;
export const SEARCH_QUERY_MAX = 80;

export function normalizeSearchQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, SEARCH_QUERY_MAX);
}

export function splitSearchTerms(query: string): string[] {
  return normalizeSearchQuery(query).split(" ").filter(Boolean).slice(0, 8);
}

export function graphemeLength(term: string): number {
  return [...term].length;
}

export function isShortTerm(term: string): boolean {
  const n = graphemeLength(term);
  return n > 0 && n <= SHORT_TERM_MAX;
}

export function escapeFtsToken(term: string): string {
  return term.replace(/"/g, '""');
}

export function ftsAndQuery(terms: string[]): string {
  return terms.map((term) => `"${escapeFtsToken(term)}"`).join(" AND ");
}

export function likePattern(term: string): string {
  return `%${term.replace(/[%_]/g, "")}%`;
}

export function partitionSearchTerms(query: string): {
  fts: string[];
  like: string[];
} {
  const terms = splitSearchTerms(query);
  return {
    fts: terms.filter((term) => !isShortTerm(term)),
    like: terms.filter(isShortTerm),
  };
}

export type SearchFilters = {
  categoryId?: string;
  infoType?: string;
  triage?: string;
  readStatus?: string;
  from?: string;
  to?: string;
};

export function parseSearchFilters(
  params: URLSearchParams | { get(name: string): string | null },
): SearchFilters {
  const pick = (name: string) => params.get(name)?.trim() || undefined;
  return {
    categoryId: pick("category"),
    infoType: pick("info_type"),
    triage: pick("triage"),
    readStatus: pick("read"),
    from: pick("from"),
    to: pick("to"),
  };
}
