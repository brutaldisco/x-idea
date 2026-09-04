import { connection } from "next/server";
import { Suspense } from "react";
import { TabBar } from "@/components/TabBar";

export const instant = false;

import { countSources } from "@/server/sources/query";
import { contextLabel, getAccountContext } from "@/server/x/context";

async function AskBody() {
  await connection();
  const ctx = await getAccountContext();
  const count = await countSources({ ctx });
  const label = contextLabel(ctx);

  return (
    <>
      <input
        className="mt-6 w-full rounded-full border border-line bg-paper-2 px-4 py-3"
        placeholder="キーワード、または質問"
        disabled
      />
      <p className="mt-4 text-ink-2 text-sm">
        検索対象は {label}（{count}件）です。検索と Ask
        は次のフェーズで有効になります。
      </p>
    </>
  );
}

export default function AskPage() {
  return (
    <>
      <main className="px-4 pt-8">
        <p className="text-ink-2 text-sm">Ask</p>
        <h1 className="font-semibold text-2xl">聞く</h1>
        <Suspense
          fallback={<p className="mt-6 text-ink-2 text-sm">読み込み中…</p>}
        >
          <AskBody />
        </Suspense>
      </main>
      <TabBar current="/ask" />
    </>
  );
}
