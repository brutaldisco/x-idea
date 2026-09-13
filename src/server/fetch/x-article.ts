import sanitizeHtml from "sanitize-html";
import { getClient } from "@/db/client";
import {
  imgParagraphs,
  NO_COVER_MARK,
  withHtmlMark,
  withoutHtmlMark,
} from "@/lib/article-html";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import {
  canonicalXArticleUrl,
  hostOf,
  isXArticleUrl,
  normalizeUrl,
  xArticleIdFromUrl,
} from "@/server/ingest/url";
import { enqueueEnrichBatch } from "@/server/jobs/enrich";
import {
  attachArticleThumbnail,
  attachArticleThumbsForSource,
} from "@/server/media/article-thumb";
import { getXAccountSecret } from "@/server/x/account";
import { fetchTweetById } from "@/server/x/client";
import {
  hasUnresolvedArticleMedia,
  tweetText,
  type XTweet,
  xArticleBody,
  xArticleImageUrls,
  xArticlePermalink,
} from "@/server/x/parse";
import { ensureValidToken } from "@/server/x/token";

const MIN_BODY = 400;
const COVER_CHECKED_MARK = "article_cover_checked";

export function shouldHydrateXArticle(input: {
  hasBody: boolean;
  needsCover: boolean;
  coverChecked: boolean;
}): boolean {
  if (!input.hasBody) {
    return true;
  }
  return input.needsCover && !input.coverChecked;
}

function articleHtml(body: string, images: readonly string[] = []): string {
  const escaped = body
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const html = `${imgParagraphs(images)}${escaped
    .split(/\n{2,}/)
    .map((part) => `<p>${part.replaceAll("\n", "<br />")}</p>`)
    .join("")}`;
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "img"],
    allowedAttributes: { img: ["src", "alt"] },
  });
}

async function updateFts(
  sourceId: string,
  title: string | null,
  body: string,
  postText: string,
): Promise<void> {
  try {
    await getClient().execute({
      sql: `UPDATE sources_fts
            SET article_title = ?, article_text = ?, post_text = ?
            WHERE source_id = ?`,
      args: [
        title ?? "",
        body.slice(0, 8000),
        postText.slice(0, 4000),
        sourceId,
      ],
    });
  } catch (error) {
    logger.warn({ err: error, sourceId }, "sources_fts article skipped");
  }
}

export async function persistNativeXArticle(
  sourceId: string,
  tweet: XTweet,
  postId?: string,
): Promise<boolean> {
  const body = xArticleBody(tweet.article);
  if (!body) {
    return false;
  }
  const permalink = xArticlePermalink(tweet);
  if (!permalink) {
    return false;
  }
  const normalized =
    canonicalXArticleUrl(permalink) ?? normalizeUrl(permalink);
  const title = tweet.article?.title?.trim() || null;
  const description = tweet.article?.preview_text?.trim() || null;
  const images = xArticleImageUrls(tweet);
  const cover = images[0] ?? null;
  const html = articleHtml(body, images);
  const postBody = tweetText(tweet);
  const client = getClient();

  const existing = await findExistingXArticle(sourceId, permalink, normalized);
  let articleId = existing?.id ?? null;
  const already = (existing?.bodyLen ?? 0) >= MIN_BODY;
  if (!articleId) {
    articleId = newId();
    await client.execute({
      sql: `INSERT INTO articles (
        id, normalized_url, original_url, domain, title, description,
        thumbnail_url, content_html, content_text, fetch_scope, fetched_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'full', datetime('now'), datetime('now'))`,
      args: [
        articleId,
        normalized,
        normalized,
        hostOf(normalized),
        title,
        description,
        cover,
        html,
        body.slice(0, 100_000),
      ],
    });
  } else if (!already) {
    await client.execute({
      sql: `UPDATE articles SET
        normalized_url = ?,
        original_url = ?,
        domain = ?,
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        thumbnail_url = COALESCE(?, NULLIF(thumbnail_url, '')),
        content_html = ?,
        content_text = ?,
        fetch_scope = 'full',
        fetch_error = NULL,
        fetched_at = datetime('now')
        WHERE id = ?`,
      args: [
        normalized,
        normalized,
        hostOf(normalized),
        title,
        description,
        cover,
        html,
        body.slice(0, 100_000),
        articleId,
      ],
    });
  } else {
    await applyXArticleCover(
      articleId,
      cover,
      images,
      existing?.contentHtml ?? "",
    );
    if (existing && existing.normalizedUrl !== normalized) {
      await client.execute({
        sql: `UPDATE articles SET
                normalized_url = ?,
                original_url = ?,
                domain = ?
              WHERE id = ?`,
        args: [normalized, normalized, hostOf(normalized), articleId],
      });
    }
  }

  await client.execute({
    sql: `INSERT OR IGNORE INTO source_articles (source_id, article_id, link_url)
          VALUES (?, ?, ?)`,
    args: [sourceId, articleId, normalized],
  });
  await unlinkExtraXArticles(sourceId, articleId);

  if (postId && postBody.length > 0) {
    await client.execute({
      sql: `UPDATE x_posts SET text = ?, fetched_at = datetime('now')
            WHERE id = ? AND length(text) < ?`,
      args: [postBody, postId, postBody.length],
    });
  }

  await updateFts(sourceId, title, body, postBody);
  if (!already) {
    await client.execute({
      sql: `UPDATE sources
            SET needs_reenrich = 1, updated_at = datetime('now')
            WHERE id = ?`,
      args: [sourceId],
    });
    await enqueueEnrichBatch();
  }
  return true;
}

async function findExistingXArticle(
  sourceId: string,
  permalink: string,
  normalized: string,
): Promise<{
  id: string;
  bodyLen: number;
  contentHtml: string;
  normalizedUrl: string;
} | null> {
  const articleKey = xArticleIdFromUrl(permalink) ?? "";
  const like = articleKey ? `%/i/article/${articleKey}%` : "";
  const linked = await getClient().execute({
    sql: `SELECT a.id, a.content_text, a.content_html, a.normalized_url
          FROM source_articles sa
          JOIN articles a ON a.id = sa.article_id
          WHERE sa.source_id = ?
            AND a.original_url LIKE '%/i/article/%'
          ORDER BY CASE
            WHEN ? != '' AND (a.original_url LIKE ? OR a.normalized_url LIKE ?)
              THEN 0
            ELSE 1
          END,
          length(IFNULL(a.content_text, '')) DESC
          LIMIT 1`,
    args: [sourceId, like, like, like],
  });
  const found = linked.rows[0]?.id
    ? linked
    : await getClient().execute({
        sql: `SELECT a.id, a.content_text, a.content_html, a.normalized_url
              FROM articles a
              WHERE a.normalized_url IN (?, ?)
                 OR a.original_url IN (?, ?)
                 OR (? != '' AND (a.original_url LIKE ? OR a.normalized_url LIKE ?))
              ORDER BY CASE WHEN a.normalized_url = ? THEN 0 ELSE 1 END
              LIMIT 1`,
        args: [
          normalized,
          normalizeUrl(permalink),
          normalized,
          permalink,
          like,
          like,
          like,
          normalized,
        ],
      });
  const row = found.rows[0];
  if (!row?.id) {
    return null;
  }
  return {
    id: String(row.id),
    bodyLen: String(row.content_text ?? "").trim().length,
    contentHtml: row.content_html ? String(row.content_html) : "",
    normalizedUrl: row.normalized_url ? String(row.normalized_url) : "",
  };
}

async function unlinkExtraXArticles(
  sourceId: string,
  keepArticleId: string,
): Promise<void> {
  const extras = await getClient().execute({
    sql: `SELECT sa.article_id
          FROM source_articles sa
          JOIN articles a ON a.id = sa.article_id
          WHERE sa.source_id = ?
            AND sa.article_id != ?
            AND a.original_url LIKE '%/i/article/%'
          LIMIT 8`,
    args: [sourceId, keepArticleId],
  });
  for (const row of extras.rows) {
    await getClient().execute({
      sql: "DELETE FROM source_articles WHERE source_id = ? AND article_id = ?",
      args: [sourceId, String(row.article_id)],
    });
  }
}

async function applyXArticleCover(
  articleId: string,
  cover: string | null,
  images: readonly string[],
  currentHtml: string,
): Promise<void> {
  if (cover) {
    await getClient().execute({
      sql: `UPDATE articles SET
              thumbnail_url = COALESCE(?, NULLIF(thumbnail_url, ''))
            WHERE id = ?`,
      args: [cover, articleId],
    });
    let next = withoutHtmlMark(currentHtml, NO_COVER_MARK);
    if (!next.includes("<img") && images.length > 0) {
      next = `${imgParagraphs(images)}${next}`;
    }
    if (next !== currentHtml) {
      await getClient().execute({
        sql: "UPDATE articles SET content_html = ? WHERE id = ?",
        args: [next, articleId],
      });
    }
    return;
  }
  if (!currentHtml.includes(NO_COVER_MARK)) {
    await getClient().execute({
      sql: "UPDATE articles SET content_html = ? WHERE id = ?",
      args: [withHtmlMark(currentHtml || "", NO_COVER_MARK), articleId],
    });
  }
}

export async function hydrateXArticleFromApi(
  sourceId: string,
): Promise<boolean> {
  if (process.env.MOCK_EXTERNAL === "1") {
    return false;
  }
  const client = getClient();
  const row = await client.execute({
    sql: `SELECT s.x_account_id, p.id AS post_id, p.tweet_id, p.raw_payload_json
          FROM sources s
          JOIN x_posts p ON p.id = s.x_post_id
          WHERE s.id = ?
          LIMIT 1`,
    args: [sourceId],
  });
  const source = row.rows[0];
  if (!source?.tweet_id || !source.x_account_id) {
    return false;
  }

  const existing = await client.execute({
    sql: `SELECT MAX(length(COALESCE(a.content_text, ''))) AS n,
                 MAX(CASE
                   WHEN a.original_url LIKE '%/i/article/%'
                    AND (a.thumbnail_url IS NULL OR a.thumbnail_url = '')
                   THEN 1 ELSE 0 END) AS need_cover
          FROM source_articles sa
          JOIN articles a ON a.id = sa.article_id
          WHERE sa.source_id = ?
          LIMIT 1`,
    args: [sourceId],
  });
  const hasBody = Number(existing.rows[0]?.n ?? 0) >= MIN_BODY;
  const needCover = Number(existing.rows[0]?.need_cover ?? 0) === 1;
  if (
    !shouldHydrateXArticle({
      hasBody,
      needsCover: needCover,
      coverChecked: payloadCoverChecked(source.raw_payload_json),
    })
  ) {
    if (!payloadHydrated(source.raw_payload_json)) {
      await markHydrated(String(source.post_id), { coverChecked: false });
    }
    return false;
  }

  const account = await getXAccountSecret(String(source.x_account_id));
  if (!account) {
    return false;
  }
  try {
    const token = await ensureValidToken(account);
    const page = await fetchTweetById(token, String(source.tweet_id));
    const tweet = page.tweets[0];
    let saved = false;
    if (tweet) {
      saved = await persistNativeXArticle(
        sourceId,
        tweet,
        String(source.post_id),
      );
      if (!saved) {
        await applyCoverFromTweet(sourceId, tweet);
      }
    }
    await markHydrated(String(source.post_id), {
      coverChecked: !tweet || !hasUnresolvedArticleMedia(tweet),
    });
    await attachArticleThumbsForSource(sourceId, { allowRefetch: false });
    return saved;
  } catch (error) {
    logger.warn({ err: error, sourceId }, "x article hydrate skipped");
    return false;
  }
}

export async function hydrateArticleRowFromTweet(
  articleId: string,
): Promise<boolean> {
  if (process.env.MOCK_EXTERNAL === "1") {
    return false;
  }
  const linked = await getClient().execute({
    sql: `SELECT sa.source_id, s.x_account_id, p.id AS post_id, p.tweet_id, a.original_url
          FROM articles a
          JOIN source_articles sa ON sa.article_id = a.id
          JOIN sources s ON s.id = sa.source_id
          JOIN x_posts p ON p.id = s.x_post_id
          WHERE a.id = ?
          LIMIT 1`,
    args: [articleId],
  });
  const row = linked.rows[0];
  if (!row?.tweet_id || !row.x_account_id) {
    return false;
  }
  if (!isXArticleUrl(String(row.original_url ?? ""))) {
    return false;
  }
  const account = await getXAccountSecret(String(row.x_account_id));
  if (!account) {
    return false;
  }
  try {
    const token = await ensureValidToken(account);
    const page = await fetchTweetById(token, String(row.tweet_id));
    const tweet = page.tweets[0];
    if (!tweet) {
      await markHydrated(String(row.post_id), { coverChecked: true });
      return false;
    }
    const saved = await persistNativeXArticle(
      String(row.source_id),
      tweet,
      String(row.post_id),
    );
    if (!saved) {
      await applyCoverFromTweet(String(row.source_id), tweet);
    }
    await markHydrated(String(row.post_id), {
      coverChecked: !hasUnresolvedArticleMedia(tweet),
    });
    await attachArticleThumbnail(articleId, { allowRefetch: false });
    await attachArticleThumbsForSource(String(row.source_id), {
      allowRefetch: false,
    });
    return saved;
  } catch (error) {
    logger.warn({ err: error, articleId }, "x article row hydrate skipped");
    return false;
  }
}

export async function refreshXArticleCovers(limit = 2): Promise<number> {
  const cap = Math.min(8, Math.max(1, limit));
  const found = await getClient().execute({
    sql: `SELECT DISTINCT a.id
          FROM articles a
          JOIN source_articles sa ON sa.article_id = a.id
          JOIN sources s ON s.id = sa.source_id
          JOIN x_posts p ON p.id = s.x_post_id
          WHERE a.original_url LIKE '%/i/article/%'
            AND (a.thumbnail_url IS NULL OR a.thumbnail_url = '')
            AND IFNULL(p.raw_payload_json, '') NOT LIKE '%"article_cover_checked":true%'
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
          ORDER BY a.fetched_at DESC
          LIMIT ?`,
    args: [cap],
  });
  let attached = 0;
  for (const row of found.rows) {
    const articleId = String(row.id);
    await hydrateArticleRowFromTweet(articleId);
    attached += await attachArticleThumbnail(articleId, {
      allowRefetch: false,
    });
    await markNoCoverIfStillMissing(articleId);
  }
  return attached;
}

async function markNoCoverIfStillMissing(articleId: string): Promise<void> {
  const row = await getClient().execute({
    sql: "SELECT thumbnail_url, content_html FROM articles WHERE id = ? LIMIT 1",
    args: [articleId],
  });
  const thumb = row.rows[0]?.thumbnail_url;
  if (thumb != null && String(thumb) !== "") {
    return;
  }
  const html = row.rows[0]?.content_html
    ? String(row.rows[0].content_html)
    : "";
  if (html.includes(NO_COVER_MARK)) {
    return;
  }
  await getClient().execute({
    sql: "UPDATE articles SET content_html = ? WHERE id = ?",
    args: [withHtmlMark(html, NO_COVER_MARK), articleId],
  });
}

async function applyCoverFromTweet(
  sourceId: string,
  tweet: XTweet,
): Promise<void> {
  const images = xArticleImageUrls(tweet);
  const cover = images[0] ?? null;
  const found = await getClient().execute({
    sql: `SELECT a.id, a.content_html
          FROM source_articles sa
          JOIN articles a ON a.id = sa.article_id
          WHERE sa.source_id = ?
            AND a.original_url LIKE '%/i/article/%'
          LIMIT 8`,
    args: [sourceId],
  });
  for (const row of found.rows) {
    await applyXArticleCover(
      String(row.id),
      cover,
      images,
      row.content_html ? String(row.content_html) : "",
    );
  }
}

function payloadHydrated(raw: unknown): boolean {
  if (typeof raw !== "string" || !raw) {
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as { article_hydrated?: unknown };
    return parsed.article_hydrated === true;
  } catch {
    return false;
  }
}

export function payloadCoverChecked(raw: unknown): boolean {
  if (typeof raw !== "string" || !raw) {
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as { article_cover_checked?: unknown };
    return parsed.article_cover_checked === true;
  } catch {
    return false;
  }
}

async function markHydrated(
  postId: string,
  options?: { coverChecked?: boolean },
): Promise<void> {
  await getClient().execute({
    sql: `UPDATE x_posts SET raw_payload_json = ? WHERE id = ?`,
    args: [
      JSON.stringify({
        article_hydrated: true,
        ...(options?.coverChecked ? { [COVER_CHECKED_MARK]: true } : {}),
      }),
      postId,
    ],
  });
}
