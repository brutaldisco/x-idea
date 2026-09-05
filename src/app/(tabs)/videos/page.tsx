import { connection } from "next/server";
import { Suspense } from "react";
import { VideosWorkspace } from "@/components/videos/VideosWorkspace";
import { listVideoLibrary } from "@/server/videos/queue";
import { contextLabel, getAccountContext } from "@/server/x/context";

export const instant = false;

async function VideosBody() {
  await connection();
  const ctx = await getAccountContext();
  const data = await listVideoLibrary(ctx);
  return <VideosWorkspace initial={data} accountLabel={contextLabel(ctx)} />;
}

export default function VideosPage() {
  return (
    <main className="px-4 pt-8">
      <p className="text-ink-2 text-sm">Videos</p>
      <h1 className="font-semibold text-2xl">動画</h1>
      <p className="mt-2 text-ink-2 text-sm">
        残したい動画だけを手元に保存し、ここで再生します。
      </p>
      <Suspense
        fallback={<p className="mt-16 text-ink-2 text-sm">読み込み中…</p>}
      >
        <VideosBody />
      </Suspense>
    </main>
  );
}
