import { connection } from "next/server";
import { Suspense } from "react";
import { VideosWorkspace } from "@/components/videos/VideosWorkspace";
import { getVideoSaveFolderName } from "@/server/settings";
import { listVideoLibrary } from "@/server/videos/queue";
import { getAccountContext } from "@/server/x/context";

export const instant = false;

async function VideosBody({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const ctx = await getAccountContext();
  const [data, videoFolderName] = await Promise.all([
    listVideoLibrary(ctx),
    getVideoSaveFolderName(),
  ]);
  return (
    <VideosWorkspace
      initial={data}
      initialFolderName={videoFolderName}
      initialQueueOpen={params.queue === "1"}
    />
  );
}

export default function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string }>;
}) {
  return (
    <main className="px-4 pt-8">
      <Suspense
        fallback={<p className="mt-16 text-ink-2 text-sm">読み込み中…</p>}
      >
        <VideosBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
