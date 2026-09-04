import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { listXAccounts, MAX_X_ACCOUNTS } from "@/server/x/account";

async function OnboardingBody({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const step = Number(params.step ?? "1");
  const accounts = await listXAccounts();
  const account = accounts[0] ?? null;

  if (step <= 1) {
    return (
      <section>
        <p className="text-sm tracking-[0.2em] text-ink-2">STEP 1</p>
        <h1 className="mt-3 font-semibold text-3xl">Marginalia へ</h1>
        <p className="mt-4 text-ink-2">
          X
          でブックマークした投稿を、要約と分類のあるライブラリにします。ログイン画面はありません。
        </p>
        <Link
          href="/onboarding?step=2"
          className="mt-10 inline-block rounded-full bg-ink px-5 py-3 font-medium text-paper"
        >
          次へ
        </Link>
      </section>
    );
  }

  if (step === 2) {
    return (
      <section>
        <p className="text-sm tracking-[0.2em] text-ink-2">STEP 2</p>
        <h1 className="mt-3 font-semibold text-3xl">X と連携</h1>
        <p className="mt-4 text-ink-2">
          スコープは bookmark.read / tweet.read / users.read / offline.access
          だけです。
        </p>
        {account ? (
          <div className="mt-6 space-y-2">
            <p className="text-sm">
              連携済み: {accounts.map((a) => `@${a.username}`).join(" / ")}
            </p>
            {accounts.length < MAX_X_ACCOUNTS ? (
              <Link
                href={`/settings/x/add?next=${encodeURIComponent("/onboarding?step=3")}`}
                className="inline-block text-sm underline"
              >
                別のアカウントを追加
              </Link>
            ) : null}
          </div>
        ) : (
          <Link
            href="/api/x/oauth/start?next=/onboarding%3Fstep=3"
            className="mt-10 inline-block rounded-full bg-ink px-5 py-3 font-medium text-paper"
          >
            X と連携する
          </Link>
        )}
        <div className="mt-6">
          <Link
            href="/onboarding?step=4"
            className="text-ink-2 text-sm underline"
          >
            あとで
          </Link>
        </div>
      </section>
    );
  }

  if (step === 3) {
    return (
      <section>
        <p className="text-sm tracking-[0.2em] text-ink-2">STEP 3</p>
        <h1 className="mt-3 font-semibold text-3xl">フォルダ連動</h1>
        <p className="mt-4 text-ink-2">
          ブックマークフォルダの写像は P2 です。いまはスキップできます。
        </p>
        <Link
          href="/onboarding?step=4"
          className="mt-10 inline-block rounded-full bg-ink px-5 py-3 font-medium text-paper"
        >
          スキップ
        </Link>
      </section>
    );
  }

  if (step === 4) {
    return (
      <section>
        <p className="text-sm tracking-[0.2em] text-ink-2">STEP 4</p>
        <h1 className="mt-3 font-semibold text-3xl">初回取り込み</h1>
        <p className="mt-4 text-ink-2">
          クレジット購入前は同期しません。規模の選択は、有効化後に Settings
          で行います。
        </p>
        <Link
          href="/onboarding?step=5"
          className="mt-10 inline-block rounded-full bg-ink px-5 py-3 font-medium text-paper"
        >
          次へ
        </Link>
      </section>
    );
  }

  return (
    <section>
      <p className="text-sm tracking-[0.2em] text-ink-2">STEP 5</p>
      <h1 className="mt-3 font-semibold text-3xl">ホーム画面へ</h1>
      <p className="mt-4 text-ink-2">
        iOS は共有シートから「ホーム画面に追加」。通知は P2 です。
      </p>
      <Link
        href="/today"
        className="mt-10 inline-block rounded-full bg-ink px-5 py-3 font-medium text-paper"
      >
        Today を開く
      </Link>
    </section>
  );
}

export default function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <Suspense fallback={<p className="text-ink-2 text-sm">読み込み中…</p>}>
        <OnboardingBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
