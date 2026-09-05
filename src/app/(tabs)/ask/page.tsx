import { connection } from "next/server";
import { Suspense } from "react";
import { AskSearch } from "@/components/AskSearch";
import { searchKeyword } from "@/server/search/keyword";
import { countSources } from "@/server/sources/query";
import { contextLabel, getAccountContext } from "@/server/x/context";

export const instant = false;

async function AskBody({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const q = params.q ?? "";
  const ctx = await getAccountContext();
  const [count, items] = await Promise.all([
    countSources({ ctx }),
    searchKeyword({ q, ctx }),
  ]);
  const label = contextLabel(ctx);

  return (
    <AskSearch
      targetLabel={label}
      targetCount={count}
      initialQuery={q}
      initialItems={items}
    />
  );
}

export default function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <main className="px-4 pt-8">
      <p className="text-ink-2 text-sm">Ask</p>
      <h1 className="font-semibold text-2xl">聞く</h1>
      <Suspense
        fallback={<p className="mt-6 text-ink-2 text-sm">読み込み中…</p>}
      >
        <AskBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
