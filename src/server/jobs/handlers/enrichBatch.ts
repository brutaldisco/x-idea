import { getClient } from "@/db/client";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { generateLaneObject } from "@/server/ai/client";
import {
  type AppliedEnrich,
  applyEnrichItem,
  fallbackEnrich,
} from "@/server/ai/enrich-post";
import {
  type EnrichBatchOutput,
  enrichBatchSchema,
} from "@/server/ai/enrich-schema";
import {
  buildEnrichUserPrompt,
  ENRICH_SYSTEM,
  type EnrichPromptSource,
  PROMPT_VERSION,
} from "@/server/ai/prompts/enrich";
import { attachTags, loadTagContext } from "@/server/ai/tags";
import { enqueueEnrichBatch } from "@/server/jobs/enrich";

const BATCH_SIZE = 5;

type BatchSource = EnrichPromptSource & {
  language: string | null;
  corpus: string;
};

export async function enrichBatch(): Promise<void> {
  const sources = await loadPendingSources();
  if (sources.length === 0) {
    return;
  }

  const [categories, tagContext, settings] = await Promise.all([
    loadCategories(),
    loadTagContext(),
    loadThreshold(),
  ]);
  const categoryIds = new Set(categories.map((row) => row.id));
  const raw = await classifyBatch(sources, categories, tagContext.frequent);
  const byId = new Map(raw.items.map((item) => [item.source_id, item]));
  const batchId = newId();

  for (const source of sources) {
    const item = byId.get(source.id);
    const applied = item
      ? applyEnrichItem(item, {
          sourceId: source.id,
          corpus: source.corpus,
          categoryIds,
          threshold: settings.threshold,
          aliases: tagContext.aliases,
        })
      : fallbackEnrich({
          sourceId: source.id,
          corpus: source.corpus,
          language: source.language,
        });
    await persistEnrichment(applied, {
      batchId,
      model: settings.model,
      output: item ?? applied,
    });
  }

  const more = await getClient().execute(
    `SELECT id FROM sources
     WHERE availability = 'available'
       AND (triage_status = 'pending' OR needs_reenrich = 1)
     ORDER BY saved_at DESC, id
     LIMIT 1`,
  );
  if (more.rows[0]) {
    await enqueueEnrichBatch();
  }
  logger.info({ batchId, n: sources.length }, "enrich_batch done");
}

async function classifyBatch(
  sources: BatchSource[],
  categories: { id: string; path: string; description: string | null }[],
  tags: string[],
): Promise<EnrichBatchOutput> {
  if (process.env.MOCK_EXTERNAL === "1" || !process.env.GEMINI_API_KEY) {
    const reason =
      process.env.MOCK_EXTERNAL === "1"
        ? "モック分類です"
        : "Gemini キー未設定のため確認待ち";
    return {
      items: sources.map((source) => ({
        source_id: source.id,
        summary: source.text.slice(0, 160),
        category_id: null,
        category_confidence: 0,
        category_candidates: [],
        new_category_suggestion: null,
        uncertainty_reason: reason,
        tags: ["未分類"],
        info_type: "idea",
        info_type_confidence: 0.2,
        importance: 2,
        language: source.language || "ja",
        key_sentences: [],
      })),
    };
  }

  const prompt = buildEnrichUserPrompt({ categories, tags, sources });
  try {
    return await generateLaneObject({
      lane: "bulk",
      schema: enrichBatchSchema,
      prompt,
      system: ENRICH_SYSTEM,
      kind: "classify",
    });
  } catch (error) {
    logger.warn({ err: error }, "enrich_batch first attempt failed");
    try {
      return await generateLaneObject({
        lane: "bulk",
        schema: enrichBatchSchema,
        prompt,
        system: ENRICH_SYSTEM,
        kind: "classify",
      });
    } catch (retryError) {
      logger.warn({ err: retryError }, "enrich_batch retry failed");
      return {
        items: sources.map((source) => ({
          source_id: source.id,
          summary: source.text.slice(0, 160) || "要約を作れませんでした",
          category_id: null,
          category_confidence: 0,
          category_candidates: [],
          new_category_suggestion: null,
          uncertainty_reason: "AI出力を検証できませんでした",
          tags: ["未分類"],
          info_type: "idea",
          info_type_confidence: 0,
          importance: 2,
          language: source.language || "ja",
          key_sentences: [],
        })),
      };
    }
  }
}

async function loadPendingSources(): Promise<BatchSource[]> {
  const ids = await getClient().execute({
    sql: `SELECT id FROM sources
     WHERE availability = 'available'
       AND (triage_status = 'pending' OR needs_reenrich = 1)
     ORDER BY saved_at DESC, id
     LIMIT ?`,
    args: [BATCH_SIZE],
  });
  if (ids.rows.length === 0) {
    return [];
  }
  const placeholders = ids.rows.map(() => "?").join(",");
  const idList = ids.rows.map((row) => String(row.id));
  const result = await getClient().execute({
    sql: `SELECT s.id, s.language,
            p.text AS post_text, p.author_name, p.author_username, p.posted_at,
            p.quoted_snapshot_json,
            a.title AS article_title, a.author AS article_author,
            a.content_text AS article_text
     FROM sources s
     LEFT JOIN x_posts p ON p.id = s.x_post_id
     LEFT JOIN source_articles sa ON sa.source_id = s.id
     LEFT JOIN articles a ON a.id = sa.article_id
     WHERE s.id IN (${placeholders})
     LIMIT 20`,
    args: idList,
  });
  const seen = new Set<string>();
  const rows: BatchSource[] = [];
  for (const row of result.rows) {
    const id = String(row.id);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const text = String(row.post_text ?? "");
    const articleText = row.article_text ? String(row.article_text) : null;
    const quoted = parseQuoted(row.quoted_snapshot_json);
    rows.push({
      id,
      authorName: row.author_name ? String(row.author_name) : null,
      authorUsername: row.author_username ? String(row.author_username) : null,
      postedAt: row.posted_at ? String(row.posted_at) : null,
      text,
      quoted,
      articleTitle: row.article_title ? String(row.article_title) : null,
      articleAuthor: row.article_author ? String(row.article_author) : null,
      articleText: articleText ? articleText.slice(0, 2000) : null,
      language: row.language ? String(row.language) : null,
      corpus: [text, quoted ?? "", articleText ?? ""].join("\n"),
    });
  }
  const order = new Map(idList.map((id, index) => [id, index]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return rows;
}

function parseQuoted(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { text?: unknown };
    return typeof parsed.text === "string" ? parsed.text : null;
  } catch {
    return null;
  }
}

async function loadCategories(): Promise<
  { id: string; path: string; description: string | null }[]
> {
  const result = await getClient().execute(
    `SELECT id, parent_id, name, description
     FROM categories
     ORDER BY sort_order, name
     LIMIT 100`,
  );
  const byId = new Map(
    result.rows.map((row) => [
      String(row.id),
      {
        id: String(row.id),
        parentId: row.parent_id ? String(row.parent_id) : null,
        name: String(row.name),
        description: row.description ? String(row.description) : null,
      },
    ]),
  );
  const pathOf = (id: string, depth = 0): string => {
    const row = byId.get(id);
    if (!row || depth > 6) {
      return id;
    }
    if (!row.parentId || !byId.has(row.parentId)) {
      return row.name;
    }
    return `${pathOf(row.parentId, depth + 1)} / ${row.name}`;
  };
  return [...byId.values()].map((row) => ({
    id: row.id,
    path: pathOf(row.id),
    description: row.description,
  }));
}

async function loadThreshold(): Promise<{ threshold: number; model: string }> {
  const result = await getClient().execute(
    "SELECT auto_file_threshold, ai_models_json FROM settings WHERE id = 1 LIMIT 1",
  );
  let model = "gemini-3.5-flash-lite";
  try {
    const parsed = JSON.parse(
      String(result.rows[0]?.ai_models_json ?? "{}"),
    ) as { bulk?: string };
    if (parsed.bulk) {
      model = parsed.bulk;
    }
  } catch {
    // keep default
  }
  return {
    threshold: Number(result.rows[0]?.auto_file_threshold ?? 0.8),
    model,
  };
}

async function persistEnrichment(
  applied: AppliedEnrich,
  meta: { batchId: string; model: string; output: unknown },
): Promise<void> {
  const client = getClient();
  await client.execute({
    sql: `UPDATE sources SET
            ai_summary = ?,
            ai_importance = ?,
            ai_key_sentences_json = ?,
            ai_uncertainty_reason = ?,
            category_id = ?,
            category_source = 'ai',
            category_confidence = ?,
            category_candidates_json = ?,
            info_type = ?,
            info_type_source = 'ai',
            triage_status = ?,
            language = COALESCE(?, language),
            needs_reenrich = 0,
            updated_at = datetime('now')
          WHERE id = ?`,
    args: [
      applied.summary,
      applied.importance,
      JSON.stringify(applied.keySentences),
      applied.uncertaintyReason,
      applied.categoryId,
      applied.categoryConfidence,
      JSON.stringify(applied.categoryCandidates),
      applied.infoType,
      applied.triage,
      applied.language,
      applied.sourceId,
    ],
  });
  await attachTags(applied.sourceId, applied.tags);
  await client.execute({
    sql: `INSERT INTO enrichments
            (id, source_id, batch_id, kind, lane, model, prompt_version,
             output_json, created_at)
          VALUES (?, ?, ?, 'classify', 'bulk', ?, ?, ?, datetime('now'))`,
    args: [
      newId(),
      applied.sourceId,
      meta.batchId,
      meta.model,
      PROMPT_VERSION,
      JSON.stringify(meta.output),
    ],
  });
  try {
    await client.execute({
      sql: "UPDATE sources_fts SET ai_summary = ? WHERE source_id = ?",
      args: [applied.summary, applied.sourceId],
    });
  } catch (error) {
    logger.warn({ err: error }, "sources_fts summary skipped");
  }
}
