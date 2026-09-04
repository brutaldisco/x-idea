import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { setAccountContext } from "@/server/x/context";

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
    const body = (await request.json()) as { ctx?: string };
    if (typeof body.ctx !== "string") {
      return Response.json(
        toErrorBody(new AppError("VALIDATION", "ctx が必要です")),
        { status: 400 },
      );
    }
    await setAccountContext(body.ctx);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
