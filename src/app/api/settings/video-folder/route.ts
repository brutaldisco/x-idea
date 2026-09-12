import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import {
  getVideoSaveFolderName,
  setVideoSaveFolderName,
} from "@/server/settings";
import { contextAccountId, getAccountContext } from "@/server/x/context";

export const instant = false;

export async function GET(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  const accountId = contextAccountId(await getAccountContext());
  return Response.json({
    ok: true,
    accountId,
    folderName: accountId ? await getVideoSaveFolderName(accountId) : null,
  });
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
    const accountId = contextAccountId(await getAccountContext());
    if (!accountId) {
      return Response.json(
        toErrorBody(new AppError("VALIDATION", "アカウントを選んでください")),
        { status: 400 },
      );
    }
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    if (typeof body.name !== "string" || !body.name.trim()) {
      return Response.json(
        toErrorBody(new AppError("VALIDATION", "フォルダ名が必要です")),
        { status: 400 },
      );
    }
    await setVideoSaveFolderName(accountId, body.name);
    return Response.json({
      ok: true,
      accountId,
      folderName: body.name.trim(),
    });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
