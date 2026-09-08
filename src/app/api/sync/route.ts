import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { enqueueJob } from "@/server/jobs/queue";
import { runJobs } from "@/server/jobs/runner";
import { getSyncSettings } from "@/server/settings";

export const instant = false;
export const maxDuration = 60;

let lastManual = 0;
const THROTTLE_MS = 60_000;

export async function POST(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    const settings = await getSyncSettings();
    if (!settings.xApiEnabled) {
      return Response.json(
        toErrorBody(new AppError("X_DISABLED", "X API が OFF です")),
        { status: 409 },
      );
    }
    const now = Date.now();
    if (now - lastManual < THROTTLE_MS) {
      return Response.json(
        toErrorBody(new AppError("RATE_LIMITED", "60秒待ってください")),
        { status: 429 },
      );
    }
    lastManual = now;
    let body: Record<string, unknown> = {};
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const parsed = (await request.json()) as unknown;
        if (parsed && typeof parsed === "object") {
          body = parsed as Record<string, unknown>;
        }
      } catch {
        body = {};
      }
    }
    const mode = body.mode === "backfill" ? "backfill" : undefined;
    const accountId =
      typeof body.x_account_id === "string" && body.x_account_id.length > 0
        ? body.x_account_id
        : undefined;
    await enqueueJob({
      type: "sync_bookmarks",
      payload: {
        trigger: "manual",
        mode,
        x_account_id: accountId,
      },
      dedupeKey: mode
        ? `backfill:${accountId ?? "all"}:${Math.floor(now / THROTTLE_MS)}`
        : `manual:${Math.floor(now / THROTTLE_MS)}`,
    });
    const result = await runJobs({ max: 3 });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
