import { getClient } from "@/db/client";
import { restoreStrippedImages } from "@/lib/article-html";
import {
  absoluteHttpUrl,
  articleThumbMediaKey,
  firstContentImage,
  isArticleThumbMediaKey,
} from "@/lib/article-thumb";
import { newId } from "@/lib/ids";
import { fetchArticlePage } from "@/server/fetch/article";
import { isXArticleUrl, isXStatusUrl, normalizeUrl } from "@/server/ingest/url";
import { enqueueJob } from "@/server/jobs/queue";
import { getExcludedDomains } from "@/server/settings";
import { tweetUrlEntries } from "@/server/x/parse";

const SKIP_REFETCH = new Set([
  "excluded_domain",
  "robots_disallow",
  "x_status",
]);

const RECOVERABLE_HTML_SQL = `(
  a.content_html LIKE '%<img%'
  OR a.content_html LIKE '%.jpg%'
  OR a.content_html LIKE '%.jpeg%'
  OR a.content_html LIKE '%.png%'
  OR a.content_html LIKE '%.webp%'
  OR a.content_html LIKE '%.gif%'
  OR a.content_html LIKE '%.avif%'
)`;

export async function attachArticleThumbsForSource(
  sourceId: string,
  options?: { allowRefetch?: boolean },
): Promise<number> {
  const found = await getClient().execute({
    sql: `SELECT article_id FROM source_articles
          WHERE source_id = ?
          LIMIT 8`,
    args: [sourceId],
  });
  let attached = 0;
  for (const row of found.rows) {
    const articleId = row.article_id ? String(row.article_id) : "";
    if (!articleId) {
      continue;
    }
    attached += await attachArticleThumbnail(articleId, {
      allowRefetch: options?.allowRefetch ?? true,
    });
  }
  return attached;
}

export async function backfillArticleThumbs(input?: {
  accountId?: string | null;
  limit?: number;
}): Promise<number> {
  const limit = Math.min(12, Math.max(1, input?.limit ?? 8));
  const accountId = input?.accountId ?? null;
  const found = await getClient().execute({
    sql: `SELECT DISTINCT a.id
          FROM articles a
          JOIN source_articles sa ON sa.article_id = a.id
          JOIN sources s ON s.id = sa.source_id
          JOIN x_posts p ON p.id = s.x_post_id
          WHERE (? IS NULL OR s.x_account_id = ?)
            AND a.fetch_scope IN ('full', 'partial', 'metadata_only')
            AND (
              (a.thumbnail_url IS NOT NULL AND a.thumbnail_url != '')
              OR ${RECOVERABLE_HTML_SQL}
            )
            AND NOT (
              a.thumbnail_url = ''
              AND IFNULL(a.fetch_error, '') IN ('excluded_domain', 'robots_disallow', 'x_status')
            )
            AND NOT EXISTS (
              SELECT 1 FROM media_assets m
              WHERE m.x_post_id = p.id
                AND m.type = 'photo'
                AND IFNULL(m.media_key, '') NOT LIKE 'article-og:%'
            )
            AND NOT EXISTS (
              SELECT 1 FROM media_assets m
              WHERE m.x_post_id = p.id
                AND m.media_key = 'article-og:' || a.id
            )
          ORDER BY CASE
            WHEN a.thumbnail_url IS NOT NULL AND a.thumbnail_url != '' THEN 0
            ELSE 1
          END, a.fetched_at DESC
          LIMIT ?`,
    args: [accountId, accountId, limit],
  });
  let attached = 0;
  for (const row of found.rows) {
    attached += await attachArticleThumbnail(String(row.id), {
      allowRefetch: false,
    });
  }
  return attached;
}

export async function attachArticleThumbnail(
  articleId: string,
  options?: { allowRefetch?: boolean },
): Promise<number> {
  const existing = await getClient().execute({
    sql: `SELECT id, original_url, thumbnail_url, content_html, fetch_error
          FROM articles
          WHERE id = ?
          LIMIT 1`,
    args: [articleId],
  });
  const article = existing.rows[0];
  if (!article) {
    return 0;
  }
  const base = String(article.original_url);
  const fetchError = article.fetch_error ? String(article.fetch_error) : "";
  const html = await restoreArticleContentImages(
    articleId,
    article.content_html ? String(article.content_html) : "",
    base,
  );
  const stored = article.thumbnail_url ? String(article.thumbnail_url) : "";
  let url =
    absoluteHttpUrl(stored || null, base) ??
    firstContentImage(html, base) ??
    (await tweetCardImage(articleId, base));
  const skipPage =
    SKIP_REFETCH.has(fetchError) || isXArticleUrl(base) || isXStatusUrl(base);
  if (!url && options?.allowRefetch && !skipPage) {
    url = await refetchThumbnailUrl(base);
  }
  if (!url) {
    if (options?.allowRefetch || SKIP_REFETCH.has(fetchError)) {
      await rememberThumbnail(articleId, null);
    }
    return 0;
  }
  await rememberThumbnail(articleId, url);

  const posts = await getClient().execute({
    sql: `SELECT s.x_post_id, s.x_account_id
          FROM source_articles sa
          JOIN sources s ON s.id = sa.source_id
          WHERE sa.article_id = ?
            AND s.x_post_id IS NOT NULL
          LIMIT 8`,
    args: [articleId],
  });
  let attached = 0;
  const key = articleThumbMediaKey(articleId);
  for (const row of posts.rows) {
    const postId = String(row.x_post_id);
    const accountId = row.x_account_id ? String(row.x_account_id) : null;
    const n = await upsertArticleThumb({
      postId,
      accountId,
      mediaKey: key,
      url,
    });
    attached += n;
  }
  return attached;
}

export async function restoreArticleContentImages(
  articleId: string,
  html: string,
  base: string,
): Promise<string> {
  const next = restoreStrippedImages(html, base);
  if (!html || next === html) {
    return html;
  }
  await getClient().execute({
    sql: "UPDATE articles SET content_html = ? WHERE id = ?",
    args: [next, articleId],
  });
  return next;
}

async function tweetCardImage(
  articleId: string,
  pageUrl: string,
): Promise<string | null> {
  const found = await getClient().execute({
    sql: `SELECT p.raw_entities_json
          FROM source_articles sa
          JOIN sources s ON s.id = sa.source_id
          JOIN x_posts p ON p.id = s.x_post_id
          WHERE sa.article_id = ?
          LIMIT 8`,
    args: [articleId],
  });
  const target = normalizeUrl(pageUrl);
  for (const row of found.rows) {
    const raw = row.raw_entities_json ? String(row.raw_entities_json) : "";
    if (!raw) {
      continue;
    }
    try {
      const links = tweetUrlEntries(JSON.parse(raw) as unknown);
      for (const link of links) {
        if (!link.image) {
          continue;
        }
        if (normalizeUrl(link.url) === target) {
          return link.image;
        }
      }
      const fallback = links.find((link) => link.image)?.image;
      if (fallback && found.rows.length === 1) {
        return fallback;
      }
    } catch {
      // ignore malformed entities
    }
  }
  return null;
}

async function refetchThumbnailUrl(pageUrl: string): Promise<string | null> {
  const excluded = await getExcludedDomains();
  const result = await fetchArticlePage({
    url: pageUrl,
    excludedDomains: excluded,
  });
  return (
    absoluteHttpUrl(result.thumbnailUrl, result.url) ??
    firstContentImage(result.contentHtml, result.url)
  );
}

async function rememberThumbnail(
  articleId: string,
  url: string | null,
): Promise<void> {
  await getClient().execute({
    sql: "UPDATE articles SET thumbnail_url = ? WHERE id = ?",
    args: [url ?? "", articleId],
  });
}

async function upsertArticleThumb(input: {
  postId: string;
  accountId: string | null;
  mediaKey: string;
  url: string;
}): Promise<number> {
  const photos = await getClient().execute({
    sql: `SELECT id, media_key FROM media_assets
          WHERE x_post_id = ? AND type = 'photo'
          LIMIT 8`,
    args: [input.postId],
  });
  const realPhoto = photos.rows.find(
    (row) =>
      !isArticleThumbMediaKey(row.media_key ? String(row.media_key) : null),
  );
  if (realPhoto) {
    return 0;
  }
  const mine = photos.rows.find(
    (row) => String(row.media_key ?? "") === input.mediaKey,
  );
  let mediaId: string;
  let shouldQueue = true;
  if (mine) {
    mediaId = String(mine.id);
    const current = await getClient().execute({
      sql: "SELECT media_url, download_status FROM media_assets WHERE id = ? LIMIT 1",
      args: [mediaId],
    });
    const prev = current.rows[0]?.media_url
      ? String(current.rows[0].media_url)
      : "";
    const status = current.rows[0]?.download_status
      ? String(current.rows[0].download_status)
      : "pending";
    if (prev !== input.url) {
      await getClient().execute({
        sql: `UPDATE media_assets SET
                media_url = ?,
                preview_url = ?,
                download_status = 'pending',
                download_error = NULL
              WHERE id = ?`,
        args: [input.url, input.url, mediaId],
      });
    } else if (status === "ready") {
      shouldQueue = false;
    } else if (status === "failed") {
      await getClient().execute({
        sql: `UPDATE media_assets SET
                download_status = 'pending',
                download_error = NULL
              WHERE id = ?`,
        args: [mediaId],
      });
    }
  } else {
    mediaId = newId();
    await getClient().execute({
      sql: `INSERT INTO media_assets (
        id, x_post_id, media_key, type, preview_url, media_url, alt_text,
        download_status, created_at
      ) VALUES (?, ?, ?, 'photo', ?, ?, '記事の画像', 'pending', datetime('now'))`,
      args: [mediaId, input.postId, input.mediaKey, input.url, input.url],
    });
  }
  if (input.accountId && shouldQueue) {
    await enqueueJob({
      type: "media_download",
      payload: { media_id: mediaId, account_id: input.accountId },
      dedupeKey: `media_download:${mediaId}`,
      timeoutSec: 1800,
    });
  }
  return 1;
}
