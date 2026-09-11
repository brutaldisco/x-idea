import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import {
  clampSourceLimit,
  clampSourcePage,
  sourcePageOffset,
} from "@/lib/source-cursor";
import { parseLibraryFilters } from "@/lib/source-filters";
import { parseSourceSort } from "@/lib/source-sort";
import { countSources, listSourcesPage } from "@/server/sources/query";
import { taxonomyForAccount } from "@/server/taxonomy";
import {
  contextAccountId,
  contextLabel,
  getAccountContext,
} from "@/server/x/context";

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
    const ctx = await getAccountContext();
    const sort = parseSourceSort(url.searchParams.get("sort"));
    const filters = parseLibraryFilters(url.searchParams);
    const limit = clampSourceLimit(url.searchParams.get("limit"));
    const pageRaw = url.searchParams.get("page");
    const cursor = url.searchParams.get("cursor");
    const numbered = pageRaw != null || !cursor;
    const page = clampSourcePage(pageRaw);
    const accountId = contextAccountId(ctx);
    const [list, count, taxonomy] = await Promise.all([
      listSourcesPage({
        ctx,
        limit,
        sort,
        cursor: numbered ? null : cursor,
        offset: numbered ? sourcePageOffset(page, limit) : 0,
        filters,
      }),
      numbered ? countSources({ ctx, filters }) : Promise.resolve(null),
      numbered ? taxonomyForAccount(accountId) : Promise.resolve(null),
    ]);
    return Response.json({
      ok: true,
      items: list.items,
      nextCursor: list.nextCursor,
      count,
      accountId,
      ...(taxonomy
        ? {
            label: contextLabel(ctx),
            categories: taxonomy.categories,
            infoTypes: taxonomy.infoTypes,
          }
        : {}),
    });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
