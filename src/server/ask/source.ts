import { getClient, isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { sourceScopeSql } from "@/server/sources/scope";
import { type AccountContext, contextAccountId } from "@/server/x/context";

const TEXT_MAX = 2000;

export type AskSourceExcerpt = {
  id: string;
  summary: string | null;
  categoryName: string | null;
  infoType: string | null;
  tags: string[];
  authorUsername: string | null;
  authorName: string | null;
  postedAt: string | null;
  text: string | null;
  articleTitle: string | null;
  articleText: string | null;
};

function clip(value: string | null, max = TEXT_MAX): string | null {
  if (!value) {
    return null;
  }
  const text = value.trim();
  if (!text) {
    return null;
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function loadAskSource(
  id: string,
  ctx: AccountContext,
): Promise<AskSourceExcerpt | null> {
  if (!isDbConfigured()) {
    return null;
  }
  await ensureSchema();
  const accountId = contextAccountId(ctx);
  if (!accountId) {
    return null;
  }
  const scope = sourceScopeSql(accountId, "s");
  const result = await getClient().execute({
    sql: `SELECT s.id, s.ai_summary, s.info_type,
                 c.name AS category_name,
                 p.text, p.author_username, p.author_name, p.posted_at,
                 a.title AS article_title,
                 substr(COALESCE(a.content_text, a.description, ''), 1, ?) AS article_text
          FROM sources s
          LEFT JOIN x_posts p ON p.id = s.x_post_id
          LEFT JOIN categories c ON c.id = s.category_id
          LEFT JOIN source_articles sa ON sa.source_id = s.id
          LEFT JOIN articles a ON a.id = sa.article_id
          WHERE s.id = ? AND ${scope.clause}
          LIMIT 1`,
    args: [TEXT_MAX, id, ...scope.args],
  });
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  const tags = await getClient().execute({
    sql: `SELECT t.name FROM source_tags st
          JOIN tags t ON t.id = st.tag_id
          WHERE st.source_id = ?
          ORDER BY t.name
          LIMIT 8`,
    args: [id],
  });
  return {
    id: String(row.id),
    summary: row.ai_summary ? String(row.ai_summary) : null,
    categoryName: row.category_name ? String(row.category_name) : null,
    infoType: row.info_type ? String(row.info_type) : null,
    tags: tags.rows.map((item) => String(item.name)),
    authorUsername: row.author_username ? String(row.author_username) : null,
    authorName: row.author_name ? String(row.author_name) : null,
    postedAt: row.posted_at ? String(row.posted_at) : null,
    text: clip(row.text ? String(row.text) : null),
    articleTitle: row.article_title ? String(row.article_title) : null,
    articleText: clip(row.article_text ? String(row.article_text) : null),
  };
}
