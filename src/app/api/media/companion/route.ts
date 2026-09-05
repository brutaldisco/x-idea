import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import {
  companionCorsHeaders,
  isLocalCompanionHost,
  writeCompanionFile,
} from "@/server/media/companion";
import { isLocalMediaEnabled, mediaRoot } from "@/server/media/paths";

export const instant = false;
export const maxDuration = 60;

function denied(): Response {
  return Response.json(
    toErrorBody(new AppError("FORBIDDEN", "ローカル保存役のみ")),
    { status: 403 },
  );
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: companionCorsHeaders(request.headers.get("origin")),
  });
}

export async function GET(request: Request) {
  await connection();
  if (!isLocalCompanionHost(request) || !isLocalMediaEnabled()) {
    return denied();
  }
  return Response.json(
    { ok: true, root: mediaRoot() },
    { headers: companionCorsHeaders(request.headers.get("origin")) },
  );
}

export async function POST(request: Request) {
  await connection();
  const cors = companionCorsHeaders(request.headers.get("origin"));
  if (!isLocalCompanionHost(request) || !isLocalMediaEnabled()) {
    return denied();
  }
  try {
    const relativePath = request.headers.get("x-relative-path") ?? "";
    const type = request.headers.get("x-media-type") ?? "photo";
    const bytes = Buffer.from(await request.arrayBuffer());
    const result = await writeCompanionFile({
      relativePath,
      type,
      bytes,
    });
    return Response.json({ ok: true, ...result }, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "write failed";
    return Response.json(toErrorBody(new AppError("VALIDATION", message)), {
      status: 400,
      headers: cors,
    });
  }
}
