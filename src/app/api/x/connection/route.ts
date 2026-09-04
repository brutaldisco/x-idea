import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { deleteXAccount, setXAccountSyncEnabled } from "@/server/x/account";

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
    const body = (await request.json()) as {
      id?: string;
      sync_enabled?: boolean;
    };
    if (typeof body.id !== "string" || typeof body.sync_enabled !== "boolean") {
      return Response.json(
        toErrorBody(
          new AppError("VALIDATION", "id と sync_enabled が必要です"),
        ),
        { status: 400 },
      );
    }
    await setXAccountSyncEnabled(body.id, body.sync_enabled);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}

export async function DELETE(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      {
        status: 403,
      },
    );
  }
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return Response.json(
        toErrorBody(new AppError("VALIDATION", "id が必要です")),
        { status: 400 },
      );
    }
    await deleteXAccount(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
