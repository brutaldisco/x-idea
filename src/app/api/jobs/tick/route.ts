import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { runTick } from "@/server/jobs/tick";

export const maxDuration = 60;

let lastClientTick = 0;
const CLIENT_THROTTLE_MS = 60_000;

function unauthorized(): Response {
  return Response.json(
    toErrorBody(new AppError("UNAUTHORIZED", "認証が必要です")),
    { status: 401 },
  );
}

export async function POST(request: Request) {
  await connection();
  try {
    const url = new URL(request.url);
    const source =
      url.searchParams.get("source") === "client" ? "client" : "cron";

    if (source === "client") {
      if (!isSameOrigin(request)) {
        return Response.json(
          toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
          { status: 403 },
        );
      }
      const now = Date.now();
      if (now - lastClientTick < CLIENT_THROTTLE_MS) {
        return Response.json({ ok: true, source, skipped: "throttled" });
      }
      lastClientTick = now;
    } else {
      const secret = process.env.CRON_SECRET;
      const header = request.headers.get("authorization");
      if (!secret || header !== `Bearer ${secret}`) {
        return unauthorized();
      }
    }

    const result = await runTick(source);
    return Response.json(result);
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
