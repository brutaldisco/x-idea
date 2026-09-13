import { getClient } from "@/db/client";
import { articleFetch } from "@/server/jobs/handlers/articleFetch";
import { enqueueJob } from "@/server/jobs/queue";

export async function enqueueArticleFetch(articleId: string): Promise<void> {
  await enqueueJob({
    type: "article_fetch",
    payload: { article_id: articleId },
    dedupeKey: `article_fetch:${articleId}`,
    timeoutSec: 60,
  });
}

export async function refreshSourceArticleHtml(
  sourceId: string,
): Promise<number> {
  const found = await getClient().execute({
    sql: `SELECT a.id FROM articles a
          JOIN source_articles sa ON sa.article_id = a.id
          WHERE sa.source_id = ?
            AND a.fetch_scope IN ('full', 'partial')
            AND a.content_html IS NOT NULL
            AND a.content_html NOT LIKE '%<img%'
            AND a.content_html NOT LIKE '%x-idea:html-refresh%'
            AND a.original_url NOT LIKE '%/i/article/%'
            AND a.domain NOT IN ('x.com', 'twitter.com')
          ORDER BY a.fetched_at DESC
          LIMIT 1`,
    args: [sourceId],
  });
  let n = 0;
  for (const row of found.rows) {
    await articleFetch({ article_id: String(row.id), force: true });
    n += 1;
  }
  return n;
}

export async function enqueueArticleHtmlRefetch(limit = 4): Promise<number> {
  const cap = Math.min(8, Math.max(1, limit));
  const result = await getClient().execute({
    sql: `SELECT id FROM articles
          WHERE fetch_scope IN ('full', 'partial')
            AND IFNULL(fetch_error, '') = ''
            AND content_html IS NOT NULL
            AND content_html NOT LIKE '%<img%'
            AND content_html NOT LIKE '%x-idea:html-refresh%'
            AND original_url NOT LIKE '%/i/article/%'
            AND domain NOT IN ('x.com', 'twitter.com')
          ORDER BY fetched_at DESC
          LIMIT ?`,
    args: [cap],
  });
  let n = 0;
  for (const row of result.rows) {
    await enqueueJob({
      type: "article_fetch",
      payload: { article_id: String(row.id), force: true },
      dedupeKey: `article_fetch_html:${row.id}`,
      timeoutSec: 60,
    });
    n += 1;
  }
  return n;
}

export async function enqueuePendingArticleFetches(
  limit = 8,
  sourceId?: string,
): Promise<number> {
  const result = sourceId
    ? await getClient().execute({
        sql: `SELECT a.id FROM articles a
              JOIN source_articles sa ON sa.article_id = a.id
              WHERE sa.source_id = ? AND (
                a.fetch_scope IN ('pending', 'failed')
                OR (
                  a.fetch_scope = 'metadata_only'
                  AND a.normalized_url LIKE '%/i/article/%'
                  AND length(COALESCE(a.content_text, '')) < 400
                )
              )
              ORDER BY a.created_at DESC LIMIT ?`,
        args: [sourceId, limit],
      })
    : await getClient().execute({
        sql: `SELECT id FROM articles
              WHERE fetch_scope = 'pending'
                 OR (
                   fetch_scope = 'metadata_only'
                   AND normalized_url LIKE '%/i/article/%'
                   AND length(COALESCE(content_text, '')) < 400
                 )
              ORDER BY created_at DESC LIMIT ?`,
        args: [limit],
      });
  let n = 0;
  for (const row of result.rows) {
    await enqueueArticleFetch(String(row.id));
    n += 1;
  }
  return n;
}
