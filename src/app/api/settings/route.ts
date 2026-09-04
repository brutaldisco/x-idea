import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { setXApiEnabled } from "@/server/settings";

export const instant = false;

export async function PATCH(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    const body = (await request.json()) as { x_api_enabled?: boolean };
    if (typeof body.x_api_enabled !== "boolean") {
      return Response.json(
        toErrorBody(new AppError("VALIDATION", "x_api_enabled が必要です")),
        { status: 400 },
      );
    }
    await setXApiEnabled(body.x_api_enabled);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
