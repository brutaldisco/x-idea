import { connection } from "next/server";
import { Suspense } from "react";
import { TabBar } from "@/components/TabBar";

export const instant = false;

import { countSources, listSources } from "@/server/sources/query";
import { contextLabel, getAccountContext } from "@/server/x/context";

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
        <li
          key={item.id}
          className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4"
        >
          {item.authorUsername ? (
            <p className="text-ink-2 text-xs">@{item.authorUsername}</p>
          ) : null}
          <p className="mt-1 text-sm">{item.summary}</p>
        </li>
      ))}
    </ul>
  );
}

export default function LibraryPage() {
  return (
    <>
      <main className="px-4 pt-8">
        <p className="text-ink-2 text-sm">Library</p>
        <h1 className="font-semibold text-2xl">ライブラリ</h1>
        <Suspense
          fallback={<p className="mt-16 text-ink-2 text-sm">読み込み中…</p>}
        >
          <LibraryBody />
        </Suspense>
      </main>
      <TabBar current="/library" />
    </>
  );
}
