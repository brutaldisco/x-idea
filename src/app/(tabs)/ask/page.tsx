import { connection } from "next/server";
import { Suspense } from "react";
import { AskSearch } from "@/components/AskSearch";
import { parseLibraryView } from "@/lib/source-filters";
import { searchKeyword } from "@/server/search/keyword";
import { countSources } from "@/server/sources/query";
import { taxonomyForAccount } from "@/server/taxonomy";
import {
  contextAccountId,
  contextLabel,
  getAccountContext,
} from "@/server/x/context";

export const instant = false;

async function AskBody({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const q = params.q ?? "";
  const ctx = await getAccountContext();
  const [count, items, taxonomy] = await Promise.all([
    countSources({ ctx }),
    searchKeyword({ q, ctx }),
    taxonomyForAccount(contextAccountId(ctx)),
  ]);
  const label = contextLabel(ctx);

  return (
    <AskSearch
      targetLabel={label}
      targetCount={count}
      accountId={contextAccountId(ctx)}
      initialQuery={q}
      initialItems={items}
      initialView={parseLibraryView(params.view)}
      categories={taxonomy.categories}
      infoTypes={taxonomy.infoTypes}
    />
  );
}

export default function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  return (
    <main className="min-w-0 overflow-x-clip px-4 pt-8">
      <h1 className="font-semibold text-2xl">Ask</h1>
      <Suspense
        fallback={<p className="mt-6 text-ink-2 text-sm">読み込み中…</p>}
      >
        <AskBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
