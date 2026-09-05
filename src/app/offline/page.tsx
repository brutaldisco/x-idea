import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <p className="text-sm tracking-[0.2em] text-ink-2">OFFLINE</p>
      <h1 className="mt-3 font-semibold text-3xl">オフラインです</h1>
      <p className="mt-4 text-ink-2">
        通信が戻るまで、直近に開いたページだけ読めます。同期や保存はできません。
      </p>
      <Link
        href="/today"
        className="mt-10 inline-block rounded-full bg-ink px-5 py-3 font-medium text-paper"
      >
        Today を試す
      </Link>
    </main>
  );
}
