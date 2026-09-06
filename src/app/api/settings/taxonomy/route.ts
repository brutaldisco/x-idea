import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import {
  addTaxonomyItem,
  getAccountTaxonomy,
  isTaxonomyItemId,
  isTaxonomyKind,
  removeTaxonomyItem,
  renameTaxonomyItem,
  type TaxonomyKind,
} from "@/server/taxonomy";

export const instant = false;

function accountIdOf(input: { get(name: string): string | null }): string {
  const value = input.get("account_id")?.trim() ?? "";
  if (!value || value.length > 48) {
    throw new AppError("VALIDATION", "アカウントが必要です");
  }
  return value;
}

function kindOf(raw: unknown): TaxonomyKind {
  if (typeof raw !== "string" || !isTaxonomyKind(raw)) {
    throw new AppError("VALIDATION", "種類が不正です");
  }
  return raw;
}

function itemIdOf(raw: unknown): string {
  if (typeof raw !== "string" || !isTaxonomyItemId(raw)) {
    throw new AppError("VALIDATION", "項目が不正です");
  }
  return raw;
}

export async function GET(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    const accountId = accountIdOf(new URL(request.url).searchParams);
    return Response.json({
      ok: true,
      taxonomy: await getAccountTaxonomy(accountId),
    });
  } catch (error) {
    return Response.json(toErrorBody(error), {
      status: error instanceof AppError ? error.status : 500,
    });
  }
}

export async function POST(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    const body = (await request.json().catch(() => ({}))) as {
      account_id?: string;
      kind?: string;
      name?: string;
    };
    if (typeof body.account_id !== "string") {
      throw new AppError("VALIDATION", "アカウントが必要です");
    }
    const item = await addTaxonomyItem({
      accountId: body.account_id,
      kind: kindOf(body.kind),
      name: typeof body.name === "string" ? body.name : "",
    });
    return Response.json({ ok: true, item });
  } catch (error) {
    return Response.json(toErrorBody(error), {
      status: error instanceof AppError ? error.status : 500,
    });
  }
}

export async function PATCH(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    const body = (await request.json().catch(() => ({}))) as {
      account_id?: string;
      kind?: string;
      item_id?: string;
      name?: string;
    };
    if (typeof body.account_id !== "string") {
      throw new AppError("VALIDATION", "アカウントが必要です");
    }
    const item = await renameTaxonomyItem({
      accountId: body.account_id,
      kind: kindOf(body.kind),
      itemId: itemIdOf(body.item_id),
      name: typeof body.name === "string" ? body.name : "",
    });
    return Response.json({ ok: true, item });
  } catch (error) {
    return Response.json(toErrorBody(error), {
      status: error instanceof AppError ? error.status : 500,
    });
  }
}

export async function DELETE(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    const params = new URL(request.url).searchParams;
    await removeTaxonomyItem({
      accountId: accountIdOf(params),
      kind: kindOf(params.get("kind")),
      itemId: itemIdOf(params.get("item_id")),
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(toErrorBody(error), {
      status: error instanceof AppError ? error.status : 500,
    });
  }
}
