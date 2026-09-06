import { unlockAction } from "@/app/unlock/actions";
import { googleGateConfigured } from "@/lib/gate";
import { safeInternalPath } from "@/lib/pwa";

const ERRORS: Record<string, string> = {
  "1": "パスコードが違います。",
  denied: "Google ログインがキャンセルされました。",
  mismatch: "許可された Google アカウントではありません。",
  google: "Google ログインに失敗しました。",
};

export async function UnlockForm({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeInternalPath(params.next);
  const hasPasscode = Boolean(process.env.APP_PASSCODE);
  const hasGoogle = googleGateConfigured();
  const error = params.error ? (ERRORS[params.error] ?? null) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="text-ink-2 text-sm tracking-wide">Marginalia</p>
      <h1 className="mt-2 font-semibold text-2xl">ライブラリを開く</h1>
      <p className="mt-2 text-ink-2 text-sm">
        このライブラリは本人確認のあとで開きます。一度入れば、このブラウザでは長く有効です。
      </p>

      {error ? <p className="mt-4 text-danger text-sm">{error}</p> : null}

      {hasGoogle ? (
        <a
          href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}
          className="mt-8 block rounded-full bg-ink px-4 py-2.5 text-center font-medium text-paper"
        >
          Google で続ける
        </a>
      ) : null}

      {hasGoogle && hasPasscode ? (
        <p className="mt-6 text-ink-2 text-sm">
          Cursor 内ブラウザで Google
          がブロックされたら、パスコードを使ってください。
        </p>
      ) : null}

      {hasPasscode ? (
        <form action={unlockAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm">
            パスコード
            <input
              className="mt-1 w-full rounded-xl border border-line bg-paper-2 px-3 py-2"
              type="password"
              name="passcode"
              autoComplete="current-password"
              required
            />
          </label>
          <button
            className="w-full rounded-full border border-line px-4 py-2.5 font-medium hover:bg-paper-2"
            type="submit"
          >
            パスコードで開く
          </button>
        </form>
      ) : null}

      {!hasGoogle && !hasPasscode ? (
        <p className="mt-8 text-ink-2 text-sm">
          ゲートは設定されていません。この画面は不要です。
        </p>
      ) : null}
    </main>
  );
}
