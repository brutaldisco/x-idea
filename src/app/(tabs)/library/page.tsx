import { connection } from "next/server";
import { Suspense } from "react";
import { SourceCard } from "@/components/SourceCard";
import { countSources, listSources } from "@/server/sources/query";
import { contextLabel, getAccountContext } from "@/server/x/context";

export const instant = false;

async function LibraryBody() {
  await connection();
  const ctx = await getAccountContext();
  const [count, items] = await Promise.all([
    countSources({ ctx }),
    listSources({ ctx, limit: 30 }),
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
      <li className="text-ink-2 text-xs">
        {label} · {count}件
      </li>
      {items.map((item) => (
        <SourceCard
          key={item.id}
          id={item.id}
          authorUsername={item.authorUsername}
          summary={item.summary}
          url={item.url}
        />
      ))}
    </ul>
  );
}

export default function LibraryPage() {
  return (
    <main className="px-4 pt-8">
      <p className="text-ink-2 text-sm">Library</p>
      <h1 className="font-semibold text-2xl">ライブラリ</h1>
      <Suspense
        fallback={<p className="mt-16 text-ink-2 text-sm">読み込み中…</p>}
      >
        <LibraryBody />
      </Suspense>
    </main>
  );
}
