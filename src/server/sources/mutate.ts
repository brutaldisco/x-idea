import { getClient, isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { normalizeTags } from "@/server/ai/enrich-post";
import { isInfoType } from "@/server/ai/info-types";
import { attachTags } from "@/server/ai/tags";
import { enqueueEnrichBatch } from "@/server/jobs/enrich";
import { sourceScopeSql } from "@/server/sources/scope";
import {
  canBulkConfirm,
  feedbackDiffs,
  inputDigest,
  isReadStatus,
  parseCategoryCandidates,
  resolveConfirmCategory,
  type SourceSnapshot,
  snoozeUntilSql,
} from "@/server/sources/triage";
import { type AccountContext, contextAccountId } from "@/server/x/context";

type SourceRow = SourceSnapshot & {
  aiCategoryId: string | null;
  aiInfoType: string | null;
  candidatesJson: string | null;
  postText: string;
  articleTitle: string | null;
};

function requireDb(): void {
  if (!isDbConfigured()) {
    throw new AppError("NOT_FOUND", "Source がありません");
  }
}

async function loadRow(
  sourceId: string,
  ctx: AccountContext,
): Promise<SourceRow> {
  requireDb();
  await ensureSchema();
  const scope = sourceScopeSql(contextAccountId(ctx), "s");
  const result = await getClient().execute({
    sql: `SELECT s.id, s.triage_status, s.category_id, s.category_source,
                 s.category_confidence, s.info_type, s.info_type_source,
                 s.snoozed_until, s.read_status, s.user_note,
                 s.category_candidates_json,
                 p.text AS post_text, a.title AS article_title
          FROM sources s
          LEFT JOIN x_posts p ON p.id = s.x_post_id
          LEFT JOIN source_articles sa ON sa.source_id = s.id
          LEFT JOIN articles a ON a.id = sa.article_id
          WHERE s.id = ? AND ${scope.clause}
          LIMIT 1`,
    args: [sourceId, ...scope.args],
  });
  const row = result.rows[0];
  if (!row) {
    throw new AppError("NOT_FOUND", "Source がありません");
  }
  return {
    id: String(row.id),
    triageStatus: String(row.triage_status),
    categoryId: row.category_id ? String(row.category_id) : null,
    categorySource: String(row.category_source ?? "none"),
    categoryConfidence:
      row.category_confidence == null ? null : Number(row.category_confidence),
    infoType: row.info_type ? String(row.info_type) : null,
    infoTypeSource: String(row.info_type_source ?? "none"),
    snoozedUntil: row.snoozed_until ? String(row.snoozed_until) : null,
    readStatus: String(row.read_status ?? "unread"),
    userNote: row.user_note ? String(row.user_note) : null,
    aiCategoryId: row.category_id ? String(row.category_id) : null,
    aiInfoType: row.info_type ? String(row.info_type) : null,
    candidatesJson: row.category_candidates_json
      ? String(row.category_candidates_json)
      : null,
    postText: row.post_text ? String(row.post_text) : "",
    articleTitle: row.article_title ? String(row.article_title) : null,
  };
}

function snapshotOf(row: SourceRow): SourceSnapshot {
  return {
    id: row.id,
    triageStatus: row.triageStatus,
    categoryId: row.categoryId,
    categorySource: row.categorySource,
    categoryConfidence: row.categoryConfidence,
    infoType: row.infoType,
    infoTypeSource: row.infoTypeSource,
    snoozedUntil: row.snoozedUntil,
    readStatus: row.readStatus,
    userNote: row.userNote,
  };
}

async function loadAllowedCategoryIds(): Promise<Set<string>> {
  const result = await getClient().execute(
    "SELECT id FROM categories ORDER BY sort_order LIMIT 100",
  );
  return new Set(result.rows.map((row) => String(row.id)));
}

async function loadAiTags(sourceId: string): Promise<string[]> {
  const result = await getClient().execute({
    sql: `SELECT t.name FROM source_tags st
          JOIN tags t ON t.id = st.tag_id
          WHERE st.source_id = ? AND st.added_by = 'ai'
          ORDER BY t.name
          LIMIT 8`,
    args: [sourceId],
  });
  return result.rows.map((row) => String(row.name));
}

async function recordFeedback(
  row: SourceRow,
  user: { categoryId: string | null; infoType: string | null; tags: string[] },
  aiTags: string[],
): Promise<void> {
  const diffs = feedbackDiffs({
    aiCategoryId: row.aiCategoryId,
    userCategoryId: user.categoryId,
    aiInfoType: row.aiInfoType,
    userInfoType: user.infoType,
    aiTags,
    userTags: user.tags,
  });
  if (diffs.length === 0) {
    return;
  }
  const digest = inputDigest(row.postText, row.articleTitle);
  const client = getClient();
  for (const diff of diffs) {
    await client.execute({
      sql: `INSERT INTO feedback_examples
              (id, source_id, field, input_digest, ai_value_json, user_value_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        newId(),
        row.id,
        diff.field,
        digest,
        JSON.stringify(diff.ai),
        JSON.stringify(diff.user),
      ],
    });
  }
}

async function updateScoped(
  sourceId: string,
  ctx: AccountContext,
  setSql: string,
  args: Array<string | number | null>,
): Promise<void> {
  const scope = sourceScopeSql(contextAccountId(ctx));
  await getClient().execute({
    sql: `UPDATE sources SET ${setSql} WHERE id = ? AND ${scope.clause}`,
    args: [...args, sourceId, ...scope.args],
  });
}

async function updateFts(
  sourceId: string,
  patch: { userNote?: string; tags?: string },
): Promise<void> {
  try {
    if (patch.userNote != null) {
      await getClient().execute({
        sql: "UPDATE sources_fts SET user_note = ? WHERE source_id = ?",
        args: [patch.userNote, sourceId],
      });
    }
    if (patch.tags != null) {
      await getClient().execute({
        sql: "UPDATE sources_fts SET tags = ? WHERE source_id = ?",
        args: [patch.tags, sourceId],
      });
    }
  } catch (error) {
    logger.warn({ err: error, sourceId }, "sources_fts update skipped");
  }
}

export async function confirmSource(
  sourceId: string,
  ctx: AccountContext,
  input?: {
    categoryId?: string;
    infoType?: string;
    tags?: string[];
  },
): Promise<{ id: string; snapshot: SourceSnapshot }> {
  const row = await loadRow(sourceId, ctx);
  const allowed = await loadAllowedCategoryIds();
  const resolved = resolveConfirmCategory({
    requestedId: input?.categoryId,
    currentId: row.categoryId,
    currentConfidence: row.categoryConfidence,
    candidates: parseCategoryCandidates(row.candidatesJson),
    allowedIds: allowed,
  });
  if (input?.infoType && !isInfoType(input.infoType)) {
    throw new AppError("VALIDATION", "情報タイプが不正です");
  }
  const infoType = input?.infoType ?? row.infoType;
  const tags = input?.tags ? normalizeTags(input.tags) : [];
  const aiTags = await loadAiTags(sourceId);
  await updateScoped(
    sourceId,
    ctx,
    `triage_status = 'confirmed',
            category_id = ?,
            category_source = CASE WHEN ? IS NULL THEN category_source ELSE 'user' END,
            category_confidence = ?,
            info_type = COALESCE(?, info_type),
            info_type_source = CASE WHEN ? IS NULL THEN info_type_source ELSE 'user' END,
            snoozed_until = NULL,
            updated_at = datetime('now')`,
    [
      resolved.categoryId,
      resolved.categoryId,
      resolved.categoryId ? (resolved.confidence ?? 1) : null,
      infoType,
      input?.infoType ?? null,
    ],
  );
  if (tags.length > 0) {
    await attachTags(sourceId, tags, "user");
    await updateFts(sourceId, { tags: tags.join(" ") });
  }
  await recordFeedback(
    row,
    {
      categoryId: resolved.categoryId,
      infoType: input?.infoType ?? null,
      tags,
    },
    aiTags,
  );
  return { id: sourceId, snapshot: snapshotOf(row) };
}

export async function archiveSource(
  sourceId: string,
  ctx: AccountContext,
): Promise<{ id: string; snapshot: SourceSnapshot }> {
  const row = await loadRow(sourceId, ctx);
  await updateScoped(
    sourceId,
    ctx,
    "triage_status = 'archived', snoozed_until = NULL, updated_at = datetime('now')",
    [],
  );
  return { id: sourceId, snapshot: snapshotOf(row) };
}

export async function snoozeSource(
  sourceId: string,
  ctx: AccountContext,
  until?: string,
): Promise<{ id: string; snapshot: SourceSnapshot; until: string }> {
  const row = await loadRow(sourceId, ctx);
  const when =
    until && !Number.isNaN(Date.parse(until))
      ? until.includes("T")
        ? until.replace("T", " ").slice(0, 19)
        : until.slice(0, 19)
      : snoozeUntilSql();
  await updateScoped(
    sourceId,
    ctx,
    "snoozed_until = ?, updated_at = datetime('now')",
    [when],
  );
  return { id: sourceId, snapshot: snapshotOf(row), until: when };
}

export async function restoreSource(
  snapshot: SourceSnapshot,
  ctx: AccountContext,
): Promise<{ id: string }> {
  await loadRow(snapshot.id, ctx);
  await updateScoped(
    snapshot.id,
    ctx,
    `triage_status = ?,
            category_id = ?,
            category_source = ?,
            category_confidence = ?,
            info_type = ?,
            info_type_source = ?,
            snoozed_until = ?,
            read_status = ?,
            user_note = ?,
            updated_at = datetime('now')`,
    [
      snapshot.triageStatus,
      snapshot.categoryId,
      snapshot.categorySource,
      snapshot.categoryConfidence,
      snapshot.infoType,
      snapshot.infoTypeSource,
      snapshot.snoozedUntil,
      snapshot.readStatus,
      snapshot.userNote,
    ],
  );
  return { id: snapshot.id };
}

export async function bulkConfirmSources(
  ctx: AccountContext,
  minConfidence: number,
): Promise<{ confirmed: number }> {
  requireDb();
  await ensureSchema();
  const min = Math.min(0.95, Math.max(0.5, minConfidence));
  const scope = sourceScopeSql(contextAccountId(ctx), "s");
  const allowed = await loadAllowedCategoryIds();
  const result = await getClient().execute({
    sql: `SELECT s.id, s.category_id, s.category_confidence, s.category_candidates_json
          FROM sources s
          WHERE ${scope.clause}
            AND s.triage_status = 'needs_review'
            AND (s.snoozed_until IS NULL OR s.snoozed_until <= datetime('now'))
          ORDER BY COALESCE(
              s.category_confidence,
              json_extract(s.category_candidates_json, '$[0].confidence'),
              0
            ) DESC, s.saved_at DESC, s.id
          LIMIT 40`,
    args: scope.args,
  });
  let confirmed = 0;
  for (const row of result.rows) {
    const resolved = resolveConfirmCategory({
      currentId: row.category_id ? String(row.category_id) : null,
      currentConfidence:
        row.category_confidence == null
          ? null
          : Number(row.category_confidence),
      candidates: parseCategoryCandidates(row.category_candidates_json),
      allowedIds: allowed,
    });
    if (!resolved.categoryId || !canBulkConfirm(resolved.confidence, min)) {
      continue;
    }
    await confirmSource(String(row.id), ctx, {
      categoryId: resolved.categoryId,
    });
    confirmed += 1;
  }
  return { confirmed };
}

export async function updateSource(
  sourceId: string,
  ctx: AccountContext,
  patch: {
    categoryId?: string | null;
    infoType?: string | null;
    tags?: string[];
  },
): Promise<{ id: string; snapshot: SourceSnapshot }> {
  const row = await loadRow(sourceId, ctx);
  const allowed = await loadAllowedCategoryIds();
  if (patch.categoryId && !allowed.has(patch.categoryId)) {
    throw new AppError("VALIDATION", "カテゴリがありません");
  }
  if (patch.infoType && !isInfoType(patch.infoType)) {
    throw new AppError("VALIDATION", "情報タイプが不正です");
  }
  const tags = patch.tags ? normalizeTags(patch.tags) : [];
  const aiTags = await loadAiTags(sourceId);
  await updateScoped(
    sourceId,
    ctx,
    `category_id = COALESCE(?, category_id),
            category_source = CASE WHEN ? IS NOT NULL THEN 'user' ELSE category_source END,
            info_type = COALESCE(?, info_type),
            info_type_source = CASE WHEN ? IS NOT NULL THEN 'user' ELSE info_type_source END,
            updated_at = datetime('now')`,
    [
      patch.categoryId ?? null,
      patch.categoryId ?? null,
      patch.infoType ?? null,
      patch.infoType ?? null,
    ],
  );
  if (patch.categoryId === null) {
    await updateScoped(
      sourceId,
      ctx,
      "category_id = NULL, category_source = 'user', updated_at = datetime('now')",
      [],
    );
  }
  if (tags.length > 0) {
    await attachTags(sourceId, tags, "user");
    await updateFts(sourceId, { tags: tags.join(" ") });
  }
  await recordFeedback(
    row,
    {
      categoryId: patch.categoryId ?? null,
      infoType: patch.infoType ?? null,
      tags,
    },
    aiTags,
  );
  return { id: sourceId, snapshot: snapshotOf(row) };
}

export async function setReadStatus(
  sourceId: string,
  ctx: AccountContext,
  status: string,
): Promise<{ id: string; status: string }> {
  if (!isReadStatus(status)) {
    throw new AppError("VALIDATION", "状態が不正です");
  }
  await loadRow(sourceId, ctx);
  await updateScoped(
    sourceId,
    ctx,
    "read_status = ?, updated_at = datetime('now')",
    [status],
  );
  return { id: sourceId, status };
}

export async function saveNote(
  sourceId: string,
  ctx: AccountContext,
  note: string,
): Promise<{ id: string }> {
  await loadRow(sourceId, ctx);
  const text = note.slice(0, 4000);
  await updateScoped(
    sourceId,
    ctx,
    "user_note = ?, updated_at = datetime('now')",
    [text],
  );
  await updateFts(sourceId, { userNote: text });
  return { id: sourceId };
}

export async function reenrichSource(
  sourceId: string,
  ctx: AccountContext,
): Promise<{ id: string }> {
  await loadRow(sourceId, ctx);
  await updateScoped(
    sourceId,
    ctx,
    "needs_reenrich = 1, updated_at = datetime('now')",
    [],
  );
  await enqueueEnrichBatch();
  return { id: sourceId };
}
