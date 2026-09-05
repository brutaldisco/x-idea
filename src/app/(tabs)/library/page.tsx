import { connection } from "next/server";
import { Suspense } from "react";
import { SourceCard } from "@/components/SourceCard";
import { SourceSortSelect } from "@/components/SourceSortSelect";
import { parseSourceSort } from "@/lib/source-sort";
import { countSources, listSources } from "@/server/sources/query";
import { contextLabel, getAccountContext } from "@/server/x/context";

export const instant = false;

async function LibraryBody({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const sort = parseSourceSort(params.sort);
  const ctx = await getAccountContext();
  const [count, items] = await Promise.all([
    countSources({ ctx }),
    listSources({ ctx, limit: 30, sort }),
  ]);
  const label = contextLabel(ctx);

  if (count === 0) {
    return (
      <p className="mt-16 text-center text-ink-2">
        {label}に保存した Source はまだありません。
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      <li className="flex items-center justify-between gap-3 text-ink-2 text-xs">
        <span>
          {label} · {count}件
        </span>
        <SourceSortSelect value={sort} />
      </li>
      {items.map((item) => (
        <SourceCard
          key={item.id}
          id={item.id}
          authorUsername={item.authorUsername}
          summary={item.summary}
          url={item.url}
          mediaId={item.mediaId}
          mediaType={item.mediaType}
          lang={item.lang}
          summaryFromAi={item.summaryFromAi}
          postedAt={item.postedAt}
        />
      ))}
    </ul>
  );
}

export default function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
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
