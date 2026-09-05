import type { EnrichItemOutput } from "@/server/ai/enrich-schema";
import type { InfoType } from "@/server/ai/info-types";

export type AppliedEnrich = {
  sourceId: string;
  summary: string;
  categoryId: string | null;
  categoryConfidence: number | null;
  categoryCandidates: { category_id: string; confidence: number }[];
  newCategorySuggestion: string | null;
  uncertaintyReason: string | null;
  tags: string[];
  infoType: InfoType;
  infoTypeConfidence: number;
  importance: 1 | 2 | 3;
  language: string;
  keySentences: string[];
  triage: "auto_filed" | "needs_review";
};

export function clampSummary(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
  let text = lines.join("\n").trim();
  if (text.length > 160) {
    text = `${text.slice(0, 159)}…`;
  }
  return text;
}

export function clampReason(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) {
    return null;
  }
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

export function normalizeTagName(raw: string): string {
  return raw
    .normalize("NFKC")
    .trim()
    .replace(/[A-Z]/g, (ch) => ch.toLowerCase());
}

export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const name = normalizeTagName(item);
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    out.push(name);
    if (out.length >= 5) {
      break;
    }
  }
  return out;
}

export function pickKeySentences(
  candidates: string[],
  corpus: string,
): string[] {
  const hay = corpus.replace(/\s+/g, "");
  const out: string[] = [];
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    const needle = trimmed.replace(/\s+/g, "");
    if (!needle || !hay.includes(needle)) {
      continue;
    }
    out.push(trimmed);
    if (out.length >= 3) {
      break;
    }
  }
  return out;
}

export function decideTriage(
  categoryId: string | null,
  confidence: number,
  threshold: number,
): "auto_filed" | "needs_review" {
  if (categoryId && confidence >= threshold) {
    return "auto_filed";
  }
  return "needs_review";
}

export function applyEnrichItem(
  item: EnrichItemOutput,
  input: {
    sourceId: string;
    corpus: string;
    categoryIds: ReadonlySet<string>;
    threshold: number;
    aliases?: ReadonlyMap<string, string>;
  },
): AppliedEnrich {
  const categoryId =
    item.category_id && input.categoryIds.has(item.category_id)
      ? item.category_id
      : null;
  const candidates = item.category_candidates
    .filter((row) => input.categoryIds.has(row.category_id))
    .slice(0, 3);
  const tags = normalizeTags(item.tags).map(
    (tag) => input.aliases?.get(tag) ?? tag,
  );
  const uniqueTags = normalizeTags(tags);
  const summary = clampSummary(item.summary);
  const confidence = categoryId ? item.category_confidence : 0;
  const triage = decideTriage(categoryId, confidence, input.threshold);
  let reason = clampReason(item.uncertainty_reason);
  if (triage === "needs_review" && !reason) {
    reason = categoryId ? "確信度が足りません" : "既存カテゴリに当てはめにくい";
  }
  return {
    sourceId: input.sourceId,
    summary,
    categoryId,
    categoryConfidence: categoryId ? item.category_confidence : null,
    categoryCandidates: candidates,
    newCategorySuggestion: item.new_category_suggestion?.trim() || null,
    uncertaintyReason: triage === "needs_review" ? reason : null,
    tags: uniqueTags.length > 0 ? uniqueTags : ["未分類"],
    infoType: item.info_type,
    infoTypeConfidence: item.info_type_confidence,
    importance: item.importance,
    language: item.language.slice(0, 16),
    keySentences: pickKeySentences(item.key_sentences, input.corpus),
    triage,
  };
}

export function fallbackEnrich(input: {
  sourceId: string;
  corpus: string;
  language?: string | null;
}): AppliedEnrich {
  const summary = clampSummary(input.corpus.slice(0, 160));
  return {
    sourceId: input.sourceId,
    summary: summary || "要約を作れませんでした",
    categoryId: null,
    categoryConfidence: null,
    categoryCandidates: [],
    newCategorySuggestion: null,
    uncertaintyReason: "AI出力を検証できませんでした",
    tags: ["未分類"],
    infoType: "idea",
    infoTypeConfidence: 0,
    importance: 2,
    language: input.language?.slice(0, 16) || "ja",
    keySentences: [],
    triage: "needs_review",
  };
}
