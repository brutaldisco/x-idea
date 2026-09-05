import { getClient, isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { logger } from "@/lib/logger";
import {
  ftsAndQuery,
  LIKE_WINDOW,
  likePattern,
  normalizeSearchQuery,
  partitionSearchTerms,
  SEARCH_LIMIT,
  type SearchFilters,
} from "@/lib/search-query";
import type { SourceListItem } from "@/server/sources/query";
import { sourceScopeSql } from "@/server/sources/scope";
import { type AccountContext, contextAccountId } from "@/server/x/context";

const SELECT_COLS = `s.id, s.kind, s.ai_summary, s.saved_at, s.bookmarked_at,
  s.triage_status, p.posted_at, p.author_username, p.text, p.lang, p.url,
  (SELECT m.id FROM media_assets m
   WHERE m.x_post_id = p.id
   ORDER BY m.created_at ASC LIMIT 1) AS media_id,
  (SELECT m.type FROM media_assets m
   WHERE m.x_post_id = p.id
   ORDER BY m.created_at ASC LIMIT 1) AS media_type`;

let ftsReady: boolean | null = null;

async function hasSourcesFts(): Promise<boolean> {
  if (ftsReady != null) {
    return ftsReady;
  }
  try {
    await getClient().execute("SELECT source_id FROM sources_fts LIMIT 1");
    ftsReady = true;
  } catch {
    ftsReady = false;
  }
  return ftsReady;
}

function mapRow(row: Record<string, unknown>): SourceListItem {
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
}

function filterSql(filters: SearchFilters): {
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

function likeClauses(terms: string[]): { clause: string[]; args: string[] } {
  const clause: string[] = [];
  const args: string[] = [];
  for (const term of terms) {
    clause.push(
      "(COALESCE(p.text, '') LIKE ? OR COALESCE(s.ai_summary, '') LIKE ? OR COALESCE(s.user_note, '') LIKE ?)",
    );
    const pattern = likePattern(term);
    args.push(pattern, pattern, pattern);
  }
  return { clause, args };
}

export async function searchKeyword(input: {
  q: string;
  ctx: AccountContext;
  limit?: number;
  filters?: SearchFilters;
}): Promise<SourceListItem[]> {
  if (!isDbConfigured()) {
    return [];
  }
  const q = normalizeSearchQuery(input.q);
  const { fts, like } = partitionSearchTerms(q);
  if (fts.length === 0 && like.length === 0) {
    return [];
  }
  await ensureSchema();
  const accountId = contextAccountId(input.ctx);
  const scope = sourceScopeSql(accountId, "s");
  if (!accountId) {
    return [];
  }
  const limit = Math.min(
    SEARCH_LIMIT,
    Math.max(1, input.limit ?? SEARCH_LIMIT),
  );
  const filters = filterSql(input.filters ?? {});
  const likes = likeClauses(like);

  const useFts = fts.length > 0 && (await hasSourcesFts());
  try {
    if (useFts) {
      const where = [
        "sources_fts MATCH ?",
        scope.clause,
        ...likes.clause,
        ...filters.clause,
      ];
      const args: Array<string | number> = [
        ftsAndQuery(fts),
        ...scope.args,
        ...likes.args,
        ...filters.args,
        q,
        limit,
      ];
      const result = await getClient().execute({
        sql: `SELECT ${SELECT_COLS},
                     bm25(sources_fts, 10.0, 8.0, 3.0, 5.0, 8.0, 6.0, 4.0) AS rank
              FROM sources_fts
              JOIN sources s ON s.id = sources_fts.source_id
              LEFT JOIN x_posts p ON p.id = s.x_post_id
              LEFT JOIN categories c ON c.id = s.category_id
              WHERE ${where.join(" AND ")}
              ORDER BY CASE WHEN c.name = ? THEN 0 ELSE 1 END, rank
              LIMIT ?`,
        args,
      });
      return result.rows.map((row) => mapRow(row as Record<string, unknown>));
    }

    const allLikes = likeClauses([...like, ...fts]);
    const where = [
      scope.clause,
      `s.id IN (
         SELECT id FROM sources
         WHERE x_account_id = ?
         ORDER BY saved_at DESC
         LIMIT ${LIKE_WINDOW}
       )`,
      ...allLikes.clause,
      ...filters.clause,
    ];
    const result = await getClient().execute({
      sql: `SELECT ${SELECT_COLS}
            FROM sources s
            LEFT JOIN x_posts p ON p.id = s.x_post_id
            LEFT JOIN categories c ON c.id = s.category_id
            WHERE ${where.join(" AND ")}
            ORDER BY CASE WHEN c.name = ? THEN 0 ELSE 1 END,
                     COALESCE(p.posted_at, s.bookmarked_at, s.saved_at) DESC
            LIMIT ?`,
      args: [
        ...scope.args,
        accountId,
        ...allLikes.args,
        ...filters.args,
        q,
        limit,
      ],
    });
    return result.rows.map((row) => mapRow(row as Record<string, unknown>));
  } catch (error) {
    logger.warn({ err: error }, "keyword search failed");
    return [];
  }
}
