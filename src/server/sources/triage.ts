import { nextMidnightInZone, toSqliteUtc } from "@/lib/datetime";

export const READ_STATUSES = [
  "unread",
  "read",
  "to_practice",
  "practiced",
  "knowledged",
] as const;

export type ReadStatus = (typeof READ_STATUSES)[number];

export const TRIAGE_STATUSES = [
  "pending",
  "auto_filed",
  "needs_review",
  "confirmed",
  "archived",
] as const;

export type TriageStatus = (typeof TRIAGE_STATUSES)[number];

export type CategoryCandidate = {
  category_id: string;
  confidence: number;
};

export type SourceSnapshot = {
  id: string;
  triageStatus: string;
  categoryId: string | null;
  categorySource: string;
  categoryConfidence: number | null;
  infoType: string | null;
  infoTypeSource: string;
  snoozedUntil: string | null;
  readStatus: string;
  userNote: string | null;
};

export function isReadStatus(value: string): value is ReadStatus {
  return (READ_STATUSES as readonly string[]).includes(value);
}

export function parseCategoryCandidates(raw: unknown): CategoryCandidate[] {
  if (!raw) {
    return [];
  }
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) {
    return [];
  }
  const out: CategoryCandidate[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as { category_id?: unknown; confidence?: unknown };
    if (typeof row.category_id !== "string" || !row.category_id) {
      continue;
    }
    const confidence = Number(row.confidence);
    out.push({
      category_id: row.category_id,
      confidence: Number.isFinite(confidence) ? confidence : 0,
    });
    if (out.length >= 3) {
      break;
    }
  }
  return out;
}

export function resolveConfirmCategory(input: {
  requestedId?: string | null;
  currentId?: string | null;
  currentConfidence?: number | null;
  candidates: CategoryCandidate[];
  allowedIds: ReadonlySet<string>;
}): { categoryId: string | null; confidence: number | null } {
  const pick = (id: string | null | undefined, confidence: number | null) => {
    if (!id || !input.allowedIds.has(id)) {
      return { categoryId: null, confidence: null };
    }
    return { categoryId: id, confidence };
  };
  if (input.requestedId) {
    return pick(input.requestedId, 1);
  }
  if (input.currentId) {
    return pick(input.currentId, input.currentConfidence ?? null);
  }
  const first = input.candidates[0];
  if (first) {
    return pick(first.category_id, first.confidence);
  }
  return { categoryId: null, confidence: null };
}

export function canBulkConfirm(
  confidence: number | null,
  minConfidence: number,
): boolean {
  return confidence != null && confidence >= minConfidence;
}

export function snoozeUntilSql(now = new Date()): string {
  return toSqliteUtc(nextMidnightInZone(now, "Asia/Tokyo"));
}

export function inputDigest(
  text: string,
  articleTitle?: string | null,
): string {
  const title = articleTitle?.trim() ?? "";
  return `${title}${title ? "\n" : ""}${text}`.slice(0, 300);
}

export function feedbackDiffs(input: {
  aiCategoryId: string | null;
  userCategoryId: string | null;
  aiInfoType: string | null;
  userInfoType: string | null;
  aiTags: string[];
  userTags: string[];
}): { field: string; ai: unknown; user: unknown }[] {
  const diffs: { field: string; ai: unknown; user: unknown }[] = [];
  if (input.userCategoryId && input.userCategoryId !== input.aiCategoryId) {
    diffs.push({
      field: "category_id",
      ai: input.aiCategoryId,
      user: input.userCategoryId,
    });
  }
  if (input.userInfoType && input.userInfoType !== input.aiInfoType) {
    diffs.push({
      field: "info_type",
      ai: input.aiInfoType,
      user: input.userInfoType,
    });
  }
  const aiTags = [...input.aiTags].sort().join("\0");
  const userTags = [...input.userTags].sort().join("\0");
  if (input.userTags.length > 0 && aiTags !== userTags) {
    diffs.push({ field: "tags", ai: input.aiTags, user: input.userTags });
  }
  return diffs;
}
