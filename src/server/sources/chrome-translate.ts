import { createHash } from "node:crypto";
import { getClient } from "@/db/client";
import {
  articleTranslateSource,
  CHROME_TRANSLATE_TARGET_LANG,
  type ChromeTranslationTargetKind,
  type ChromeTranslationView,
  postTranslateSource,
} from "@/lib/chrome-translate";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";

type StoredTranslation = {
  targetKind: ChromeTranslationTargetKind;
  targetId: string;
  sourceHash: string;
  sourceLang: string | null;
  text: string;
  translatedAt: string;
};

export type TranslationTarget = {
  kind: ChromeTranslationTargetKind;
  id: string;
  source: string;
};

function hashSource(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function translationKey(kind: ChromeTranslationTargetKind, id: string): string {
  return `${kind}:${id}`;
}

export function postSourceString(post: {
  text: string;
  quotedSnapshot?: { text?: string } | null;
}): string {
  return postTranslateSource(post);
}

export function articleSourceString(article: {
  title: string | null;
  contentText: string | null;
  description: string | null;
}): string {
  return articleTranslateSource(article);
}

export async function loadChromeTranslations(
  targets: TranslationTarget[],
): Promise<Map<string, ChromeTranslationView>> {
  const out = new Map<string, ChromeTranslationView>();
  if (targets.length === 0) {
    return out;
  }

  const postIds = targets
    .filter((target) => target.kind === "x_post")
    .map((target) => target.id);
  const articleIds = targets
    .filter((target) => target.kind === "article")
    .map((target) => target.id);

  const clauses: string[] = [];
  const args: string[] = [];
  if (postIds.length > 0) {
    clauses.push(
      `(target_kind = 'x_post' AND target_id IN (${postIds.map(() => "?").join(",")}))`,
    );
    args.push(...postIds);
  }
  if (articleIds.length > 0) {
    clauses.push(
      `(target_kind = 'article' AND target_id IN (${articleIds.map(() => "?").join(",")}))`,
    );
    args.push(...articleIds);
  }

  const result = await getClient().execute({
    sql: `SELECT target_kind, target_id, source_hash, source_lang, text, translated_at
          FROM chrome_translations
          WHERE target_lang = ?
            AND (${clauses.join(" OR ")})
          LIMIT 64`,
    args: [CHROME_TRANSLATE_TARGET_LANG, ...args],
  });

  const rows = new Map<string, StoredTranslation>();
  for (const row of result.rows) {
    const kind = String(row.target_kind) as ChromeTranslationTargetKind;
    const id = String(row.target_id);
    rows.set(translationKey(kind, id), {
      targetKind: kind,
      targetId: id,
      sourceHash: String(row.source_hash),
      sourceLang: row.source_lang ? String(row.source_lang) : null,
      text: String(row.text),
      translatedAt: String(row.translated_at),
    });
  }

  for (const target of targets) {
    const row = rows.get(translationKey(target.kind, target.id));
    if (!row) {
      continue;
    }
    if (row.sourceHash !== hashSource(target.source)) {
      continue;
    }
    out.set(translationKey(target.kind, target.id), {
      text: row.text,
      sourceLang: row.sourceLang,
      translatedAt: row.translatedAt,
    });
  }

  return out;
}

async function loadPostRow(id: string): Promise<{
  text: string;
  quotedSnapshot: { text?: string } | null;
} | null> {
  const result = await getClient().execute({
    sql: `SELECT text, quoted_snapshot_json
          FROM x_posts WHERE id = ? LIMIT 1`,
    args: [id],
  });
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  let quotedSnapshot: { text?: string } | null = null;
  if (row.quoted_snapshot_json) {
    try {
      quotedSnapshot = JSON.parse(String(row.quoted_snapshot_json)) as {
        text?: string;
      };
    } catch {
      quotedSnapshot = null;
    }
  }
  return {
    text: String(row.text ?? ""),
    quotedSnapshot,
  };
}

async function loadArticleRow(id: string): Promise<{
  title: string | null;
  contentText: string | null;
  description: string | null;
} | null> {
  const result = await getClient().execute({
    sql: `SELECT title, content_text, description
          FROM articles WHERE id = ? LIMIT 1`,
    args: [id],
  });
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    title: row.title ? String(row.title) : null,
    contentText: row.content_text ? String(row.content_text) : null,
    description: row.description ? String(row.description) : null,
  };
}

export async function resolveTranslationSource(
  kind: ChromeTranslationTargetKind,
  id: string,
): Promise<{ source: string; sourceHash: string } | null> {
  if (kind === "x_post") {
    const post = await loadPostRow(id);
    if (!post) {
      return null;
    }
    const source = postSourceString(post);
    return { source, sourceHash: hashSource(source) };
  }
  const article = await loadArticleRow(id);
  if (!article) {
    return null;
  }
  const source = articleSourceString(article);
  return { source, sourceHash: hashSource(source) };
}

export async function upsertChromeTranslation(input: {
  kind: ChromeTranslationTargetKind;
  id: string;
  text: string;
  sourceLang: string | null;
  sourceHash: string;
}): Promise<{ id: string }> {
  const resolved = await resolveTranslationSource(input.kind, input.id);
  if (!resolved) {
    throw new AppError("NOT_FOUND", "翻訳対象が見つかりません");
  }
  if (resolved.sourceHash !== input.sourceHash) {
    throw new AppError("CONFLICT", "原文が更新されたため翻訳を保存できません");
  }

  const rowId = newId();
  await getClient().execute({
    sql: `INSERT INTO chrome_translations (
            id, target_kind, target_id, target_lang,
            source_hash, source_lang, text, translated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(target_kind, target_id, target_lang) DO UPDATE SET
            source_hash = excluded.source_hash,
            source_lang = excluded.source_lang,
            text = excluded.text,
            translated_at = datetime('now')`,
    args: [
      rowId,
      input.kind,
      input.id,
      CHROME_TRANSLATE_TARGET_LANG,
      resolved.sourceHash,
      input.sourceLang,
      input.text,
    ],
  });

  const existing = await getClient().execute({
    sql: `SELECT id FROM chrome_translations
          WHERE target_kind = ? AND target_id = ? AND target_lang = ?
          LIMIT 1`,
    args: [input.kind, input.id, CHROME_TRANSLATE_TARGET_LANG],
  });

  return { id: String(existing.rows[0]?.id ?? rowId) };
}

export { hashSource as chromeTranslateSourceHashSync };
