import { connection } from "next/server";
import { Suspense } from "react";
import { SourceCard } from "@/components/SourceCard";
import { countSources, listSources } from "@/server/sources/query";
import { contextLabel, getAccountContext } from "@/server/x/context";

export const instant = false;

async function InboxBody() {
  await connection();
  const ctx = await getAccountContext();
  const [count, items] = await Promise.all([
    countSources({ ctx, triage: "needs_review" }),
    listSources({ ctx, triage: "needs_review", limit: 30 }),
  ]);
  const label = contextLabel(ctx);

  if (count === 0) {
    return (
      <p className="mt-16 text-center text-ink-2">
        {label}の Inbox は空です。ライブラリへどうぞ。
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <SourceCard
          key={item.id}
          id={item.id}
          authorUsername={item.authorUsername}
          summary={item.summary}
          url={item.url}
          mediaId={item.mediaId}
          mediaType={item.mediaType}
        />
      ))}
    </ul>
  );
}

export default function InboxPage() {
  return (
    <main className="px-4 pt-8">
      <p className="text-ink-2 text-sm">Inbox</p>
      <h1 className="font-semibold text-2xl">要確認</h1>
      <Suspense
        fallback={<p className="mt-16 text-ink-2 text-sm">読み込み中…</p>}
      >
        <InboxBody />
      </Suspense>
    </main>
  );
}
