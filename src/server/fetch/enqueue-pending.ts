import { getClient } from "@/db/client";
import { enqueueJob } from "@/server/jobs/queue";

export async function enqueueArticleFetch(articleId: string): Promise<void> {
  await enqueueJob({
    type: "article_fetch",
    payload: { article_id: articleId },
    dedupeKey: `article_fetch:${articleId}`,
    timeoutSec: 60,
  });
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
