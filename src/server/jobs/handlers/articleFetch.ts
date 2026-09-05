import { getClient } from "@/db/client";
import { logger } from "@/lib/logger";
import { fetchArticlePage } from "@/server/fetch/article";
import { hostOf, isXHost } from "@/server/ingest/url";
import { getExcludedDomains } from "@/server/settings";

export async function articleFetch(payload?: {
  article_id?: string;
}): Promise<void> {
  if (!payload?.article_id) {
    throw new Error("article_fetch payload missing");
  }
  if (process.env.MOCK_EXTERNAL === "1") {
    logger.info({ articleId: payload.article_id }, "article_fetch mocked");
    return;
  }

  const existing = await getClient().execute({
    sql: `SELECT id, original_url, fetch_scope FROM articles WHERE id = ? LIMIT 1`,
    args: [payload.article_id],
  });
  const row = existing.rows[0];
  if (!row) {
    throw new Error("article not found");
  }
  const url = String(row.original_url);
  if (row.fetch_scope === "full" || row.fetch_scope === "partial") {
    return;
  }
  if (isXHost(url)) {
    await saveResult(payload.article_id, {
      scope: "metadata_only",
      error: "x_host",
      httpStatus: null,
      title: null,
      author: null,
      publishedAt: null,
      description: null,
      thumbnailUrl: null,
      contentHtml: null,
      contentText: null,
      contentLinks: [],
      url,
    });
    return;
  }

  const excluded = await getExcludedDomains();
  const result = await fetchArticlePage({ url, excludedDomains: excluded });
  await saveResult(payload.article_id, {
    scope: result.scope,
    error: result.error,
    httpStatus: result.httpStatus,
    title: result.title,
    author: result.author,
    publishedAt: result.publishedAt,
    description: result.description,
    thumbnailUrl: result.thumbnailUrl,
    contentHtml: result.contentHtml,
    contentText: result.contentText,
    contentLinks: result.contentLinks,
    url: result.url,
  });
  logger.info(
    { articleId: payload.article_id, scope: result.scope },
    "article_fetch done",
  );
}

async function saveResult(
  id: string,
  result: {
    scope: string;
    error: string | null;
    httpStatus: number | null;
    title: string | null;
    author: string | null;
    publishedAt: string | null;
    description: string | null;
    thumbnailUrl: string | null;
    contentHtml: string | null;
    contentText: string | null;
    contentLinks: string[];
    url: string;
  },
): Promise<void> {
  await getClient().execute({
    sql: `UPDATE articles SET
      original_url = ?,
      domain = ?,
      title = COALESCE(?, title),
      author = COALESCE(?, author),
      published_at = COALESCE(?, published_at),
      description = COALESCE(?, description),
      thumbnail_url = COALESCE(?, thumbnail_url),
      content_html = ?,
      content_text = ?,
      content_links_json = ?,
      fetch_scope = ?,
      fetch_error = ?,
      http_status = ?,
      fetched_at = datetime('now')
      WHERE id = ?`,
    args: [
      result.url,
      hostOf(result.url),
      result.title,
      result.author,
      result.publishedAt,
      result.description,
      result.thumbnailUrl,
      result.contentHtml,
      result.contentText,
      JSON.stringify(result.contentLinks),
      result.scope,
      result.error,
      result.httpStatus,
      id,
    ],
  });
}
