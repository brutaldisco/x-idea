import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { InboxWorkspace } from "@/components/InboxWorkspace";
import { parseSourceSort } from "@/lib/source-sort";
import {
  countInboxBulk,
  countSources,
  listInbox,
} from "@/server/sources/query";
import { contextLabel, getAccountContext } from "@/server/x/context";

export const instant = false;

async function InboxBody({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const sort = parseSourceSort(params.sort);
  const ctx = await getAccountContext();
  const [count, items, bulkCount] = await Promise.all([
    countSources({ ctx, triage: "needs_review" }),
    listInbox({ ctx, limit: 30, sort }),
    countInboxBulk(ctx, 0.7),
  ]);
  const label = contextLabel(ctx);

  if (count === 0) {
    return (
      <div className="mt-16 text-center">
        <p className="text-ink-2">
          {label}の Inbox は空です。ライブラリへどうぞ。
        </p>
        <Link
          href="/library"
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ink px-4 text-paper text-sm"
        >
          ライブラリを開く
        </Link>
      </div>
    );
  }

  return (
    <InboxWorkspace
      items={items}
      label={label}
      bulkCount={bulkCount}
      sort={sort}
    />
  );
}

export default function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  return (
    <main className="px-4 pt-8">
      <p className="text-ink-2 text-sm">Inbox</p>
      <h1 className="font-semibold text-2xl">要確認</h1>
      <Suspense
        fallback={<p className="mt-16 text-ink-2 text-sm">読み込み中…</p>}
      >
        <InboxBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
