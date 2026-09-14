import { getClient } from "@/db/client";
import {
  linkifyPlainUrlsInHtml,
  NO_COVER_MARK,
  withHtmlMark,
  withoutHtmlMark,
} from "@/lib/article-html";
import {
  expandTcoInText,
  expansionsFromEntitiesJson,
  parseEntitiesJson,
} from "@/lib/expand-tco";
import { logger } from "@/lib/logger";

const SCAN = 80;

export function rewriteStoredTco(input: {
  text?: string | null;
  html?: string | null;
  entitiesJson: unknown;
}): { text: string | null; html: string | null; changed: boolean } {
  const expansions = expansionsFromEntitiesJson(input.entitiesJson);
  const text = input.text ?? null;
  const html = input.html ?? null;
  const nextText = text != null ? expandTcoInText(text, expansions) : null;
  let nextHtml = html != null ? expandTcoInText(html, expansions) : null;
  if (nextHtml != null && nextHtml !== html) {
    const marked = nextHtml.includes(NO_COVER_MARK);
    nextHtml = linkifyPlainUrlsInHtml(withoutHtmlMark(nextHtml, NO_COVER_MARK));
    if (marked) {
      nextHtml = withHtmlMark(nextHtml, NO_COVER_MARK);
    }
  }
  return {
    text: nextText,
    html: nextHtml,
    changed: nextText !== text || nextHtml !== html,
  };
}

export async function backfillStoredTco(limit = 16): Promise<{
  posts: number;
  articles: number;
}> {
  const cap = Math.min(32, Math.max(1, limit));
  const posts = await backfillPosts(cap);
  const articles = await backfillArticles(cap);
  return { posts, articles };
}

async function backfillPosts(limit: number): Promise<number> {
  const found = await getClient().execute({
    sql: `SELECT id, text, raw_entities_json
          FROM x_posts
          WHERE text LIKE '%://t.co/%'
          ORDER BY fetched_at DESC
          LIMIT ?`,
    args: [SCAN],
  });
  let updated = 0;
  for (const row of found.rows) {
    if (updated >= limit) {
      break;
    }
    const text = String(row.text ?? "");
    const next = rewriteStoredTco({
      text,
      entitiesJson: parseEntitiesJson(
        row.raw_entities_json ? String(row.raw_entities_json) : null,
      ),
    });
    if (!next.changed || next.text == null || next.text === text) {
      continue;
    }
    await getClient().execute({
      sql: "UPDATE x_posts SET text = ?, fetched_at = datetime('now') WHERE id = ?",
      args: [next.text, String(row.id)],
    });
    await updatePostFts(String(row.id), next.text);
    updated += 1;
  }
  return updated;
}

async function backfillArticles(limit: number): Promise<number> {
  const found = await getClient().execute({
    sql: `SELECT a.id, a.content_text, a.content_html, p.raw_entities_json
          FROM articles a
          JOIN source_articles sa ON sa.article_id = a.id
          JOIN sources s ON s.id = sa.source_id
          JOIN x_posts p ON p.id = s.x_post_id
          WHERE a.content_text LIKE '%://t.co/%'
             OR a.content_html LIKE '%://t.co/%'
          ORDER BY a.fetched_at DESC
          LIMIT ?`,
    args: [SCAN],
  });
  let updated = 0;
  for (const row of found.rows) {
    if (updated >= limit) {
      break;
    }
    const contentText = row.content_text ? String(row.content_text) : null;
    const contentHtml = row.content_html ? String(row.content_html) : null;
    const next = rewriteStoredTco({
      text: contentText,
      html: contentHtml,
      entitiesJson: parseEntitiesJson(
        row.raw_entities_json ? String(row.raw_entities_json) : null,
      ),
    });
    if (!next.changed) {
      continue;
    }
    await getClient().execute({
      sql: `UPDATE articles
            SET content_text = COALESCE(?, content_text),
                content_html = COALESCE(?, content_html)
            WHERE id = ?`,
      args: [next.text, next.html, String(row.id)],
    });
    if (next.text) {
      await updateArticleFts(String(row.id), next.text);
    }
    updated += 1;
  }
  return updated;
}

async function updatePostFts(postId: string, text: string): Promise<void> {
  try {
    await getClient().execute({
      sql: `UPDATE sources_fts
            SET post_text = ?
            WHERE source_id IN (
              SELECT id FROM sources WHERE x_post_id = ? LIMIT 1
            )`,
      args: [text.slice(0, 4000), postId],
    });
  } catch (error) {
    logger.warn({ err: error, postId }, "sources_fts post t.co skipped");
  }
}

async function updateArticleFts(
  articleId: string,
  text: string,
): Promise<void> {
  try {
    await getClient().execute({
      sql: `UPDATE sources_fts
            SET article_text = ?
            WHERE source_id IN (
              SELECT source_id FROM source_articles WHERE article_id = ? LIMIT 8
            )`,
      args: [text.slice(0, 8000), articleId],
    });
  } catch (error) {
    logger.warn({ err: error, articleId }, "sources_fts article t.co skipped");
  }
}
