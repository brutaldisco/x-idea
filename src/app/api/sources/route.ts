import { connection } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { isSameOrigin } from "@/lib/origin";
import { clampSourceLimit } from "@/lib/source-cursor";
import { parseLibraryFilters } from "@/lib/source-filters";
import { parseSourceSort } from "@/lib/source-sort";
import {
  countSources,
  listCategories,
  listSourcesPage,
} from "@/server/sources/query";
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
    const cursor = url.searchParams.get("cursor");
    const accountId = contextAccountId(ctx);
    const [page, count, categories, taxonomy] = await Promise.all([
      listSourcesPage({
        ctx,
        limit,
        sort,
        cursor,
        filters,
      }),
      cursor ? Promise.resolve(null) : countSources({ ctx, filters }),
      cursor ? Promise.resolve([]) : listCategories(accountId),
      cursor ? Promise.resolve(null) : taxonomyForAccount(accountId),
    ]);
    return Response.json({
      ok: true,
      items: page.items,
      nextCursor: page.nextCursor,
      count,
      accountId,
      ...(taxonomy
        ? {
            label: contextLabel(ctx),
            categories,
            infoTypes: taxonomy.infoTypes,
          }
        : {}),
    });
  } catch (error) {
    return Response.json(toErrorBody(error), { status: 500 });
  }
}
