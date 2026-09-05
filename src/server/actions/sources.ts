"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { type ActionResult, actionFail, actionOk } from "@/lib/action-result";
import { INFO_TYPES } from "@/server/ai/info-types";
import {
  archiveSource as archiveSourceRow,
  bulkConfirmSources,
  confirmSource as confirmSourceRow,
  reenrichSource,
  restoreSource as restoreSourceRow,
  saveNote as saveNoteRow,
  setReadStatus as setReadStatusRow,
  snoozeSource as snoozeSourceRow,
  updateSource as updateSourceRow,
} from "@/server/sources/mutate";
import { READ_STATUSES, type SourceSnapshot } from "@/server/sources/triage";
import { getAccountContext } from "@/server/x/context";

const idSchema = z.string().min(1).max(48);
const snapshotSchema = z.object({
  id: idSchema,
  triageStatus: z.string(),
  categoryId: z.string().nullable(),
  categorySource: z.string(),
  categoryConfidence: z.number().nullable(),
  infoType: z.string().nullable(),
  infoTypeSource: z.string(),
  snoozedUntil: z.string().nullable(),
  readStatus: z.string(),
  userNote: z.string().nullable(),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

function finish<T>(data: T): ActionResult<T> {
  updateTag("sources");
  updateTag("today");
  refresh();
  return actionOk(data);
}

function fail(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: error.issues[0]?.message ?? "入力が不正です",
      },
    };
  }
  return actionFail(error);
}

export async function confirmSource(input: {
  id: string;
  category_id?: string;
  info_type?: string;
  tags?: string[];
}): Promise<ActionResult<{ id: string; snapshot: SourceSnapshot }>> {
  try {
    const body = parse(
      z.object({
        id: idSchema,
        category_id: z.string().min(1).max(48).optional(),
        info_type: z.enum(INFO_TYPES).optional(),
        tags: z.array(z.string().max(40)).max(8).optional(),
      }),
      input,
    );
    const ctx = await getAccountContext();
    return finish(
      await confirmSourceRow(body.id, ctx, {
        categoryId: body.category_id,
        infoType: body.info_type,
        tags: body.tags,
      }),
    );
  } catch (error) {
    return fail(error);
  }
}

export async function archiveSource(
  id: string,
): Promise<ActionResult<{ id: string; snapshot: SourceSnapshot }>> {
  try {
    const ctx = await getAccountContext();
    return finish(await archiveSourceRow(parse(idSchema, id), ctx));
  } catch (error) {
    return fail(error);
  }
}

export async function snoozeSource(input: {
  id: string;
  until?: string;
}): Promise<
  ActionResult<{ id: string; snapshot: SourceSnapshot; until: string }>
> {
  try {
    const body = parse(
      z.object({
        id: idSchema,
        until: z.string().max(40).optional(),
      }),
      input,
    );
    const ctx = await getAccountContext();
    return finish(await snoozeSourceRow(body.id, ctx, body.until));
  } catch (error) {
    return fail(error);
  }
}

export async function restoreSource(
  snapshot: SourceSnapshot,
): Promise<ActionResult<{ id: string }>> {
  try {
    const body = parse(snapshotSchema, snapshot);
    const ctx = await getAccountContext();
    return finish(await restoreSourceRow(body, ctx));
  } catch (error) {
    return fail(error);
  }
}

export async function bulkConfirm(input?: {
  minConfidence?: number;
}): Promise<ActionResult<{ confirmed: number }>> {
  try {
    const body = parse(
      z.object({
        minConfidence: z.number().min(0.5).max(0.95).optional(),
      }),
      input ?? {},
    );
    const ctx = await getAccountContext();
    return finish(await bulkConfirmSources(ctx, body.minConfidence ?? 0.7));
  } catch (error) {
    return fail(error);
  }
}

export async function updateSource(input: {
  id: string;
  category_id?: string | null;
  info_type?: string | null;
  tags?: string[];
}): Promise<ActionResult<{ id: string; snapshot: SourceSnapshot }>> {
  try {
    const body = parse(
      z.object({
        id: idSchema,
        category_id: z.string().min(1).max(48).nullable().optional(),
        info_type: z.enum(INFO_TYPES).nullable().optional(),
        tags: z.array(z.string().max(40)).max(8).optional(),
      }),
      input,
    );
    const ctx = await getAccountContext();
    return finish(
      await updateSourceRow(body.id, ctx, {
        categoryId: body.category_id,
        infoType: body.info_type,
        tags: body.tags,
      }),
    );
  } catch (error) {
    return fail(error);
  }
}

export async function setReadStatus(input: {
  id: string;
  status: string;
}): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    const body = parse(
      z.object({
        id: idSchema,
        status: z.enum(READ_STATUSES),
      }),
      input,
    );
    const ctx = await getAccountContext();
    return finish(await setReadStatusRow(body.id, ctx, body.status));
  } catch (error) {
    return fail(error);
  }
}

export async function saveNote(input: {
  id: string;
  note: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const body = parse(
      z.object({
        id: idSchema,
        note: z.string().max(4000),
      }),
      input,
    );
    const ctx = await getAccountContext();
    return finish(await saveNoteRow(body.id, ctx, body.note));
  } catch (error) {
    return fail(error);
  }
}

export async function reenrich(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getAccountContext();
    return finish(await reenrichSource(parse(idSchema, id), ctx));
  } catch (error) {
    return fail(error);
  }
}
