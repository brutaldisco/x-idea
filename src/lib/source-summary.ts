const URL_ONLY = /^(https?:\/\/\S+\s*)+$/i;

export function cardSummary(input: {
  aiSummary?: string | null;
  postText?: string | null;
  articleExcerpt?: string | null;
}): { summary: string; fromAi: boolean } {
  const article = (input.articleExcerpt ?? "").trim();
  if (article.length >= 40) {
    return { summary: article.slice(0, 180), fromAi: false };
  }
  const post = (input.postText ?? "").trim();
  if (post && !URL_ONLY.test(post) && post.length >= 40) {
    return { summary: post.slice(0, 180), fromAi: false };
  }
  const ai = (input.aiSummary ?? "").trim();
  if (ai) {
    return { summary: ai.slice(0, 180), fromAi: true };
  }
  if (post) {
    return { summary: post.slice(0, 180), fromAi: false };
  }
  return { summary: "(本文なし)", fromAi: false };
}

export const ARTICLE_EXCERPT_SQL = `(SELECT substr(
  CASE
    WHEN a.title IS NOT NULL AND length(a.title) > 0
      AND instr(a.content_text, a.title) != 1
    THEN a.title || char(10) || a.content_text
    ELSE a.content_text
  END, 1, 240)
  FROM source_articles sa
  JOIN articles a ON a.id = sa.article_id
  WHERE sa.source_id = s.id
    AND length(COALESCE(a.content_text, '')) >= 40
  ORDER BY length(a.content_text) DESC
  LIMIT 1) AS article_excerpt`;
