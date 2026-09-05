import { getClient } from "@/db/client";
import { newId } from "@/lib/ids";
import { enqueueArticleFetch } from "@/server/fetch/enqueue-pending";
import {
  extractHttpUrls,
  hostOf,
  normalizeUrl,
  shouldFetchArticle,
} from "@/server/ingest/url";
import { type TweetLink, tweetUrlEntries } from "@/server/x/parse";

export async function attachArticleLinks(
  sourceId: string,
  links: TweetLink[],
): Promise<number> {
  const client = getClient();
  let attached = 0;
  for (const link of links) {
    if (!shouldFetchArticle(link.url)) {
      continue;
    }
    const normalized = normalizeUrl(link.url);
    const existing = await client.execute({
      sql: "SELECT id FROM articles WHERE normalized_url = ? LIMIT 1",
      args: [normalized],
    });
    let articleId = existing.rows[0]?.id ? String(existing.rows[0].id) : null;
    if (!articleId) {
      articleId = newId();
      await client.execute({
        sql: `INSERT INTO articles (
          id, normalized_url, original_url, domain, title, description,
          fetch_scope, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
        args: [
          articleId,
          normalized,
          link.url,
          hostOf(link.url),
          link.title ?? null,
          link.description ?? null,
        ],
      });
    }
    await client.execute({
      sql: `INSERT OR IGNORE INTO source_articles (source_id, article_id, link_url)
            VALUES (?, ?, ?)`,
      args: [sourceId, articleId, link.url],
    });
    await enqueueArticleFetch(articleId);
    attached += 1;
  }
  return attached;
}

export function collectArticleLinks(input: {
  text: string;
  entitiesJson?: string | null;
}): TweetLink[] {
  const fromEntities = tweetUrlEntries(
    input.entitiesJson ? safeJson(input.entitiesJson) : null,
  );
  const known = new Set(fromEntities.map((item) => item.url));
  const extra: TweetLink[] = [];
  for (const url of extractHttpUrls(input.text)) {
    if (!known.has(url)) {
      extra.push({ url });
    }
  }
  return [...fromEntities, ...extra].slice(0, 8);
}

export async function ensureSourceArticles(sourceId: string): Promise<number> {
  const result = await getClient().execute({
    sql: `SELECT p.text, p.raw_entities_json
          FROM sources s
          JOIN x_posts p ON p.id = s.x_post_id
          WHERE s.id = ?
          LIMIT 1`,
    args: [sourceId],
  });
  const row = result.rows[0];
  if (!row) {
    return 0;
  }
  return attachArticleLinks(
    sourceId,
    collectArticleLinks({
      text: row.text ? String(row.text) : "",
      entitiesJson: row.raw_entities_json
        ? String(row.raw_entities_json)
        : null,
    }),
  );
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
