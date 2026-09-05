import sanitizeHtml from "sanitize-html";
import { getClient } from "@/db/client";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { hostOf, isXArticleUrl, normalizeUrl } from "@/server/ingest/url";
import { enqueueEnrichBatch } from "@/server/jobs/enrich";
import { getXAccountSecret } from "@/server/x/account";
import { fetchTweetById } from "@/server/x/client";
import {
  tweetText,
  type XTweet,
  xArticleBody,
  xArticlePermalink,
} from "@/server/x/parse";
import { ensureValidToken } from "@/server/x/token";

const MIN_BODY = 400;

function articleHtml(body: string): string {
  const escaped = body
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const html = escaped
    .split(/\n{2,}/)
    .map((part) => `<p>${part.replaceAll("\n", "<br />")}</p>`)
    .join("");
  return sanitizeHtml(html, {
    allowedTags: ["p", "br"],
    allowedAttributes: {},
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
  const normalized = normalizeUrl(permalink);
  const title = tweet.article?.title?.trim() || null;
  const description = tweet.article?.preview_text?.trim() || null;
  const html = articleHtml(body);
  const postBody = tweetText(tweet);
  const client = getClient();

  const existing = await client.execute({
    sql: "SELECT id, content_text FROM articles WHERE normalized_url = ? LIMIT 1",
    args: [normalized],
  });
  let articleId = existing.rows[0]?.id ? String(existing.rows[0].id) : null;
  const already =
    String(existing.rows[0]?.content_text ?? "").trim().length >= MIN_BODY;
  if (!articleId) {
    articleId = newId();
    await client.execute({
      sql: `INSERT INTO articles (
        id, normalized_url, original_url, domain, title, description,
        content_html, content_text, fetch_scope, fetched_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'full', datetime('now'), datetime('now'))`,
      args: [
        articleId,
        normalized,
        permalink,
        hostOf(permalink),
        title,
        description,
        html,
        body.slice(0, 100_000),
      ],
    });
  } else if (!already) {
    await client.execute({
      sql: `UPDATE articles SET
        original_url = ?,
        domain = ?,
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        content_html = ?,
        content_text = ?,
        fetch_scope = 'full',
        fetch_error = NULL,
        fetched_at = datetime('now')
        WHERE id = ?`,
      args: [
        permalink,
        hostOf(permalink),
        title,
        description,
        html,
        body.slice(0, 100_000),
        articleId,
      ],
    });
  }

  await client.execute({
    sql: `INSERT OR IGNORE INTO source_articles (source_id, article_id, link_url)
          VALUES (?, ?, ?)`,
    args: [sourceId, articleId, permalink],
  });

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
  if (payloadHydrated(source.raw_payload_json)) {
    return false;
  }

  const existing = await client.execute({
    sql: `SELECT MAX(length(COALESCE(a.content_text, ''))) AS n
          FROM source_articles sa
          JOIN articles a ON a.id = sa.article_id
          WHERE sa.source_id = ?
          LIMIT 1`,
    args: [sourceId],
  });
  if (Number(existing.rows[0]?.n ?? 0) >= MIN_BODY) {
    await markHydrated(String(source.post_id));
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
    const saved = tweet
      ? await persistNativeXArticle(sourceId, tweet, String(source.post_id))
      : false;
    await markHydrated(String(source.post_id));
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
      return false;
    }
    return persistNativeXArticle(
      String(row.source_id),
      tweet,
      String(row.post_id),
    );
  } catch (error) {
    logger.warn({ err: error, articleId }, "x article row hydrate skipped");
    return false;
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

async function markHydrated(postId: string): Promise<void> {
  await getClient().execute({
    sql: `UPDATE x_posts SET raw_payload_json = ? WHERE id = ?`,
    args: [JSON.stringify({ article_hydrated: true }), postId],
  });
}
