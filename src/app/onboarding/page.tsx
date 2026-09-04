import Link from "next/link";

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <p className="text-sm tracking-[0.2em] text-ink-2">WELCOME</p>
      <h1 className="mt-3 font-semibold text-3xl">Marginalia へ</h1>
      <p className="mt-4 text-ink-2">
        X
        連携（OAuth）は次の実装タスクです。いまはライブラリの器とジョブ基盤だけが動いています。
      </p>
      <Link
        href="/today"
        className="mt-10 rounded-full bg-ink px-5 py-3 text-center font-medium text-paper"
      >
        Today に戻る
      </Link>
    </main>
  );
}
