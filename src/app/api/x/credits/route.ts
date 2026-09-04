import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { getUsageDashboard } from "@/server/usage/dashboard";
import { addCreditEntry } from "@/server/usage/ledger";

export const instant = false;

const MAX_USD = 1_000;

export async function POST(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    const body = (await request.json()) as {
      kind?: string;
      amount_usd?: number;
    };
    if (body.kind === "refresh") {
      const usage = await getUsageDashboard({ refresh: true });
      return Response.json({ ok: true, usage });
    }
    if (body.kind !== "topup" && body.kind !== "snapshot") {
      return Response.json(
        toErrorBody(
          new AppError("VALIDATION", "kind は topup / snapshot / refresh"),
        ),
        { status: 400 },
      );
    }
    const amount = Number(body.amount_usd);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_USD) {
      return Response.json(
        toErrorBody(
          new AppError("VALIDATION", "amount_usd は 0 より大きく 1000 以下"),
        ),
        { status: 400 },
      );
    }
    await addCreditEntry(body.kind, amount);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
