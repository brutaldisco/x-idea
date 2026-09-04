import { Suspense } from "react";
import { UnlockForm } from "@/app/unlock/form";

export default function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
          <p className="text-ink-2 text-sm">読み込み中…</p>
        </main>
      }
    >
      <UnlockForm searchParams={searchParams} />
    </Suspense>
  );
}
