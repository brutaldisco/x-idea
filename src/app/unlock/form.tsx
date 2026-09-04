import { unlockAction } from "@/app/unlock/actions";

export async function UnlockForm({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="text-sm tracking-wide text-ink-2">Marginalia</p>
      <h1 className="mt-2 font-semibold text-2xl">パスコード</h1>
      <p className="mt-2 text-ink-2 text-sm">
        このライブラリはパスコードで保護されています。
      </p>
      <form action={unlockAction} className="mt-8 space-y-4">
        <input type="hidden" name="next" value={params.next ?? "/today"} />
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
        {params.error ? (
          <p className="text-danger text-sm">パスコードが違います。</p>
        ) : null}
        <button
          className="w-full rounded-full bg-ink px-4 py-2.5 font-medium text-paper"
          type="submit"
        >
          開く
        </button>
      </form>
    </main>
  );
}
