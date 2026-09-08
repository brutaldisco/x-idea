import { Suspense } from "react";
import { LibraryClient } from "@/components/LibraryClient";

export default function LibraryPage() {
  return (
    <main className="min-w-0 overflow-x-clip px-4 pt-8">
      <h1 className="font-semibold text-2xl">Library</h1>
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
        <LibraryClient />
      </Suspense>
    </main>
  );
}
