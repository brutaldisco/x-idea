import { getClient, isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { sourceScopeSql } from "@/server/sources/scope";
import { type AccountContext, contextAccountId } from "@/server/x/context";

export type SourceListItem = {
  id: string;
  kind: string;
  summary: string;
  savedAt: string;
  triageStatus: string;
  authorUsername: string | null;
  url: string | null;
  lang: string | null;
  summaryFromAi: boolean;
  mediaId: string | null;
  mediaType: string | null;
};

export async function listSources(input: {
  ctx: AccountContext;
  triage?: string;
  limit: number;
}): Promise<SourceListItem[]> {
  if (!isDbConfigured()) {
    return [];
  }
  await ensureSchema();
  const scope = sourceScopeSql(contextAccountId(input.ctx), "s");
  const where = [scope.clause];
  const args: Array<string | number> = [...scope.args];
  if (input.triage) {
    where.push("s.triage_status = ?");
    args.push(input.triage);
  }
  args.push(input.limit);
  const result = await getClient().execute({
    sql: `SELECT s.id, s.kind, s.ai_summary, s.saved_at, s.triage_status,
                 p.author_username, p.text, p.lang, p.url,
                 (SELECT m.id FROM media_assets m
                  WHERE m.x_post_id = p.id
                  ORDER BY m.created_at ASC LIMIT 1) AS media_id,
                 (SELECT m.type FROM media_assets m
                  WHERE m.x_post_id = p.id
                  ORDER BY m.created_at ASC LIMIT 1) AS media_type
          FROM sources s
          LEFT JOIN x_posts p ON p.id = s.x_post_id
          WHERE ${where.join(" AND ")}
          ORDER BY COALESCE(p.posted_at, s.bookmarked_at, s.saved_at) DESC,
                   s.id DESC
          LIMIT ?`,
    args,
  });
  return result.rows.map((row) => {
    const fromAi = Boolean(row.ai_summary);
    const summary =
      (row.ai_summary ? String(row.ai_summary) : "") ||
      (row.text ? String(row.text) : "") ||
      "(本文なし)";
    return {
      id: String(row.id),
      kind: String(row.kind),
      summary: summary.slice(0, 180),
      savedAt: String(row.saved_at),
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
  }
  const result = await getClient().execute({
    sql: `SELECT COUNT(*) AS n FROM sources WHERE ${where.join(" AND ")} LIMIT 1`,
    args,
  });
  return Number(result.rows[0]?.n ?? 0);
}
