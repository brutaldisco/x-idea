import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isLocalMediaEnabled } from "@/server/media/paths";
import { revealMediaFolder } from "@/server/media/reveal";

export const instant = false;

function redirectToSettings(request: Request): Response {
  return Response.redirect(new URL("/settings", request.url), 303);
}

function isTrustedOpen(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  return site === "same-origin" || site === "same-site";
}

export async function GET(request: Request) {
  await connection();
  if (!isTrustedOpen(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  if (!isLocalMediaEnabled()) {
    return Response.json(
      toErrorBody(
        new AppError("VALIDATION", "この環境ではローカル保存しません"),
      ),
      { status: 409 },
    );
  }
  try {
    const account = new URL(request.url).searchParams.get("account");
    await revealMediaFolder(account);
    return redirectToSettings(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "account not found") {
      return Response.json(
        toErrorBody(new AppError("NOT_FOUND", "アカウントがありません")),
        { status: 404 },
      );
    }
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
