import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

async function CaptureBody({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const title = params.title?.trim() || "";
  const text = params.text?.trim() || "";
  const url = params.url?.trim() || "";
  const empty = !title && !text && !url;

  return (
    <section>
      <p className="text-ink-2 text-sm">Capture</p>
      <h1 className="font-semibold text-2xl">共有を受け取りました</h1>
      {empty ? (
        <p className="mt-4 text-ink-2">
          Android の共有シートから Marginalia
          を選ぶと、ここにタイトル・本文・URL が入ります。保存 API
          は次の段階です。
        </p>
      ) : (
        <dl className="mt-6 space-y-3 text-sm">
          {title ? (
            <div>
              <dt className="text-ink-2">タイトル</dt>
              <dd className="mt-1 break-words">{title}</dd>
            </div>
          ) : null}
          {text ? (
            <div>
              <dt className="text-ink-2">テキスト</dt>
              <dd className="mt-1 break-words whitespace-pre-wrap">{text}</dd>
            </div>
          ) : null}
          {url ? (
            <div>
              <dt className="text-ink-2">URL</dt>
              <dd className="mt-1 break-all">
                <a className="underline" href={url} rel="noreferrer">
                  {url}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      )}
      <Link
        href="/today"
        className="mt-10 inline-block rounded-full bg-ink px-5 py-3 font-medium text-paper"
      >
        Today に戻る
      </Link>
    </section>
  );
}

export default function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <Suspense fallback={<p className="text-ink-2 text-sm">読み込み中…</p>}>
        <CaptureBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
