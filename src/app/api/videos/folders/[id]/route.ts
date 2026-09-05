import { connection } from "next/server";
import { ensureSchema } from "@/db/ensure";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { deleteVideoFolder } from "@/server/videos/queue";
import { getAccountContext } from "@/server/x/context";

export const instant = false;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    await ensureSchema();
    const { id } = await context.params;
    const ctx = await getAccountContext();
    await deleteVideoFolder(id, ctx);
    return Response.json({ ok: true });
  } catch (error) {
    const body = toErrorBody(error);
    const status = error instanceof AppError ? error.status : 500;
    return Response.json(body, { status });
  }
}
