import { getClient, isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import {
  parseSourceSort,
  type SourceSort,
  sourceSortSql,
} from "@/lib/source-sort";
import { sourceScopeSql } from "@/server/sources/scope";
import {
  canBulkConfirm,
  parseCategoryCandidates,
  resolveConfirmCategory,
} from "@/server/sources/triage";
import { type AccountContext, contextAccountId } from "@/server/x/context";

const NOT_SNOOZED =
  "(s.snoozed_until IS NULL OR s.snoozed_until <= datetime('now'))";

export type CategoryChip = {
  categoryId: string;
  name: string;
  confidence: number;
};

export type SourceListItem = {
  id: string;
  kind: string;
  summary: string;
  savedAt: string;
  postedAt: string | null;
  triageStatus: string;
  authorUsername: string | null;
  url: string | null;
  lang: string | null;
  summaryFromAi: boolean;
  mediaId: string | null;
  mediaType: string | null;
};

export type InboxListItem = SourceListItem & {
  uncertaintyReason: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryConfidence: number | null;
  candidates: CategoryChip[];
  tags: string[];
};

export async function listSources(input: {
  ctx: AccountContext;
  triage?: string;
  limit: number;
  sort?: SourceSort | string;
}): Promise<SourceListItem[]> {
  if (!isDbConfigured()) {
    return [];
  }
  await ensureSchema();
  const sort = parseSourceSort(input.sort);
  const scope = sourceScopeSql(contextAccountId(input.ctx), "s");
  const where = [scope.clause];
  const args: Array<string | number> = [...scope.args];
  if (input.triage) {
    where.push("s.triage_status = ?");
    args.push(input.triage);
    if (input.triage === "needs_review") {
      where.push(NOT_SNOOZED);
    }
  }
  args.push(input.limit);
  const result = await getClient().execute({
    sql: `SELECT s.id, s.kind, s.ai_summary, s.saved_at, s.bookmarked_at,
                 s.triage_status, p.posted_at, p.author_username, p.text, p.lang,
                 p.url,
                 (SELECT m.id FROM media_assets m
                  WHERE m.x_post_id = p.id
                  ORDER BY m.created_at ASC LIMIT 1) AS media_id,
                 (SELECT m.type FROM media_assets m
                  WHERE m.x_post_id = p.id
                  ORDER BY m.created_at ASC LIMIT 1) AS media_type
          FROM sources s
          LEFT JOIN x_posts p ON p.id = s.x_post_id
          WHERE ${where.join(" AND ")}
          ORDER BY ${sourceSortSql(sort)}
          LIMIT ?`,
    args,
  });
  return result.rows.map((row) => {
    const fromAi = Boolean(row.ai_summary);
    const summary =
      (row.ai_summary ? String(row.ai_summary) : "") ||
      (row.text ? String(row.text) : "") ||
      "(本文なし)";
    const postedAt = row.posted_at
      ? String(row.posted_at)
      : row.bookmarked_at
        ? String(row.bookmarked_at)
        : row.saved_at
          ? String(row.saved_at)
          : null;
    return {
      id: String(row.id),
      kind: String(row.kind),
      summary: summary.slice(0, 180),
      savedAt: String(row.saved_at),
      postedAt,
      triageStatus: String(row.triage_status),
      authorUsername: row.author_username ? String(row.author_username) : null,
      url: row.url ? String(row.url) : null,
      lang: row.lang ? String(row.lang) : null,
      summaryFromAi: fromAi,
      mediaId: row.media_id ? String(row.media_id) : null,
      mediaType: row.media_type ? String(row.media_type) : null,
    };
  });
}

export async function listInbox(input: {
  ctx: AccountContext;
  limit: number;
  sort?: SourceSort | string;
}): Promise<InboxListItem[]> {
  if (!isDbConfigured()) {
    return [];
  }
  await ensureSchema();
  const sort = parseSourceSort(input.sort);
  const scope = sourceScopeSql(contextAccountId(input.ctx), "s");
  const names = await loadCategoryNames();
  const result = await getClient().execute({
    sql: `SELECT s.id, s.kind, s.ai_summary, s.saved_at, s.bookmarked_at,
                 s.triage_status, s.ai_uncertainty_reason, s.category_id,
                 s.category_confidence, s.category_candidates_json,
                 p.posted_at, p.author_username, p.text, p.lang, p.url,
                 (SELECT m.id FROM media_assets m
                  WHERE m.x_post_id = p.id
                  ORDER BY m.created_at ASC LIMIT 1) AS media_id,
                 (SELECT m.type FROM media_assets m
                  WHERE m.x_post_id = p.id
                  ORDER BY m.created_at ASC LIMIT 1) AS media_type
          FROM sources s
          LEFT JOIN x_posts p ON p.id = s.x_post_id
          WHERE ${scope.clause}
            AND s.triage_status = 'needs_review'
            AND ${NOT_SNOOZED}
          ORDER BY ${sourceSortSql(sort)}
          LIMIT ?`,
    args: [...scope.args, input.limit],
  });
  const tagsBySource = await loadInboxTags(
    result.rows.map((row) => String(row.id)),
  );
  return result.rows.map((row) => {
    const fromAi = Boolean(row.ai_summary);
    const summary =
      (row.ai_summary ? String(row.ai_summary) : "") ||
      (row.text ? String(row.text) : "") ||
      "(本文なし)";
    const postedAt = row.posted_at
      ? String(row.posted_at)
      : row.bookmarked_at
        ? String(row.bookmarked_at)
        : row.saved_at
          ? String(row.saved_at)
          : null;
    const categoryId = row.category_id ? String(row.category_id) : null;
    const candidates = parseCategoryCandidates(row.category_candidates_json)
      .filter((item) => names.has(item.category_id))
      .map((item) => ({
        categoryId: item.category_id,
        name: names.get(item.category_id) ?? item.category_id,
        confidence: item.confidence,
      }));
    return {
      id: String(row.id),
      kind: String(row.kind),
      summary: summary.slice(0, 180),
      savedAt: String(row.saved_at),
      postedAt,
      triageStatus: String(row.triage_status),
      authorUsername: row.author_username ? String(row.author_username) : null,
      url: row.url ? String(row.url) : null,
      lang: row.lang ? String(row.lang) : null,
      summaryFromAi: fromAi,
      mediaId: row.media_id ? String(row.media_id) : null,
      mediaType: row.media_type ? String(row.media_type) : null,
      uncertaintyReason: row.ai_uncertainty_reason
        ? String(row.ai_uncertainty_reason)
        : null,
      categoryId,
      categoryName: categoryId ? (names.get(categoryId) ?? categoryId) : null,
      categoryConfidence:
        row.category_confidence == null
          ? null
          : Number(row.category_confidence),
      candidates,
      tags: tagsBySource.get(String(row.id)) ?? [],
    };
  });
}

async function loadInboxTags(
  sourceIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (sourceIds.length === 0) {
    return map;
  }
  const placeholders = sourceIds.map(() => "?").join(",");
  const result = await getClient().execute({
    sql: `SELECT st.source_id, t.name
          FROM source_tags st
          JOIN tags t ON t.id = st.tag_id
          WHERE st.source_id IN (${placeholders})
          LIMIT 150`,
    args: sourceIds,
  });
  for (const row of result.rows) {
    const id = String(row.source_id);
    const list = map.get(id) ?? [];
    if (list.length < 5) {
      list.push(String(row.name));
      map.set(id, list);
    }
  }
  return map;
}

async function loadCategoryNames(): Promise<Map<string, string>> {
  const result = await getClient().execute(
    "SELECT id, name FROM categories ORDER BY sort_order LIMIT 100",
  );
  return new Map(result.rows.map((row) => [String(row.id), String(row.name)]));
}

export async function countInboxBulk(
  ctx: AccountContext,
  minConfidence = 0.7,
): Promise<number> {
  if (!isDbConfigured()) {
    return 0;
  }
  await ensureSchema();
  const scope = sourceScopeSql(contextAccountId(ctx), "s");
  const names = await loadCategoryNames();
  const allowedIds = new Set(names.keys());
  const result = await getClient().execute({
    sql: `SELECT s.category_id, s.category_confidence, s.category_candidates_json
          FROM sources s
          WHERE ${scope.clause}
            AND s.triage_status = 'needs_review'
            AND (s.snoozed_until IS NULL OR s.snoozed_until <= datetime('now'))
          ORDER BY COALESCE(
              s.category_confidence,
              json_extract(s.category_candidates_json, '$[0].confidence'),
              0
            ) DESC, s.saved_at DESC, s.id
          LIMIT 40`,
    args: scope.args,
  });
  let n = 0;
  for (const row of result.rows) {
    const resolved = resolveConfirmCategory({
      currentId: row.category_id ? String(row.category_id) : null,
      currentConfidence:
        row.category_confidence == null
          ? null
          : Number(row.category_confidence),
      candidates: parseCategoryCandidates(row.category_candidates_json),
      allowedIds,
    });
    if (
      resolved.categoryId &&
      canBulkConfirm(resolved.confidence, minConfidence)
    ) {
      n += 1;
    }
  }
  return n;
}

export async function countSources(input: {
  ctx: AccountContext;
  triage?: string;
}): Promise<number> {
  if (!isDbConfigured()) {
    return 0;
  }
  await ensureSchema();
  const scope = sourceScopeSql(contextAccountId(input.ctx));
  const where = [scope.clause];
  const args: string[] = [...scope.args];
  if (input.triage) {
    where.push("triage_status = ?");
    args.push(input.triage);
    if (input.triage === "needs_review") {
      where.push("(snoozed_until IS NULL OR snoozed_until <= datetime('now'))");
    }
  }
  const result = await getClient().execute({
    sql: `SELECT COUNT(*) AS n FROM sources WHERE ${where.join(" AND ")} LIMIT 1`,
    args,
  });
  return Number(result.rows[0]?.n ?? 0);
}
