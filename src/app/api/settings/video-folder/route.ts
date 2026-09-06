import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import {
  getVideoSaveFolderName,
  setVideoSaveFolderName,
} from "@/server/settings";

export const instant = false;

export async function GET(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  return Response.json({
    ok: true,
    folderName: await getVideoSaveFolderName(),
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
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    if (typeof body.name !== "string" || !body.name.trim()) {
      return Response.json(
        toErrorBody(new AppError("VALIDATION", "フォルダ名が必要です")),
        { status: 400 },
      );
    }
    await setVideoSaveFolderName(body.name);
    return Response.json({ ok: true, folderName: body.name.trim() });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
