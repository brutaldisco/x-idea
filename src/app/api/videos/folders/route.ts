import { connection } from "next/server";
import { ensureSchema } from "@/db/ensure";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { createVideoFolder } from "@/server/videos/queue";
import { getAccountContext } from "@/server/x/context";

export const instant = false;

export async function POST(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    await ensureSchema();
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const ctx = await getAccountContext();
    const folder = await createVideoFolder(body.name ?? "", ctx);
    return Response.json({ ok: true, folder });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "folder name empty") {
      return Response.json(
        toErrorBody(new AppError("VALIDATION", "フォルダ名を入力してください")),
        { status: 400 },
      );
    }
    const body = toErrorBody(error);
    const status = error instanceof AppError ? error.status : 500;
    return Response.json(body, { status });
  }
}
