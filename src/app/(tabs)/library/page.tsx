import { connection } from "next/server";
import { Suspense } from "react";
import { LibraryQueryProvider } from "@/components/LibraryQueryProvider";
import { LibraryWorkspace } from "@/components/LibraryWorkspace";
import { SOURCE_PAGE_SIZE } from "@/lib/source-cursor";
import {
  hasLibraryFilters,
  parseLibraryFilters,
  parseLibraryView,
} from "@/lib/source-filters";
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

async function LibraryBody({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
  const sort = parseSourceSort(params.sort);
  const view = parseLibraryView(params.view);
  const filters = parseLibraryFilters(query);
  const ctx = await getAccountContext();
  const accountId = contextAccountId(ctx);
  const [count, page, categories, taxonomy] = await Promise.all([
    countSources({ ctx, filters }),
    listSourcesPage({ ctx, limit: SOURCE_PAGE_SIZE, sort, filters }),
    listCategories(accountId),
    taxonomyForAccount(accountId),
  ]);
  const label = contextLabel(ctx);

  if (count === 0 && !hasLibraryFilters(filters)) {
    return (
      <p className="mt-16 text-center text-ink-2">
        {label}に保存した Source はまだありません。
      </p>
    );
  }

  return (
    <LibraryQueryProvider>
      <LibraryWorkspace
        items={page.items}
        nextCursor={page.nextCursor}
        count={count}
        label={label}
        sort={sort}
        view={view}
        filters={filters}
        categories={categories}
        infoTypes={taxonomy.infoTypes}
      />
    </LibraryQueryProvider>
  );
}

export default function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  return (
    <main className="px-4 pt-8">
      <p className="text-ink-2 text-sm">Library</p>
      <h1 className="font-semibold text-2xl">ライブラリ</h1>
      <form action="/ask" className="mt-4">
        <input
          name="q"
          className="w-full rounded-full border border-line bg-paper-2 px-4 py-2 text-sm"
          placeholder="ライブラリを検索（Ask）"
        />
      </form>
      <Suspense
        fallback={<p className="mt-16 text-ink-2 text-sm">読み込み中…</p>}
      >
        <LibraryBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
