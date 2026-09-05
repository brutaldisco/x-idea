import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { parseSearchFilters, SEARCH_LIMIT } from "@/lib/search-query";
import { searchKeyword } from "@/server/search/keyword";
import { getAccountContext } from "@/server/x/context";

export const instant = false;

export async function GET(request: Request) {
  await connection();
  if (!isSameOrigin(request)) {
    return Response.json(
      toErrorBody(new AppError("FORBIDDEN", "同一オリジンのみ")),
      { status: 403 },
    );
  }
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const ctx = await getAccountContext();
    const items = await searchKeyword({
      q,
      ctx,
      limit: SEARCH_LIMIT,
      filters: parseSearchFilters(url.searchParams),
    });
    return Response.json({ ok: true, mode: "keyword", q, items });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
