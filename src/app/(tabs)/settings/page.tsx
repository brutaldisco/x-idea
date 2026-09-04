import { connection } from "next/server";
import { Suspense } from "react";
import { TabBar } from "@/components/TabBar";
import { getHealth } from "@/server/health";

async function SettingsBody() {
  await connection();
  const health = await getHealth();
  return (
    <div className="space-y-3">
      <ServiceCard
        name="X API"
        state={health.x_connected ? "無料枠" : "未設定"}
        note="クレジット未購入のため同期は OFF のままです。"
      />
      <ServiceCard
        name="Gemini"
        state="無料枠"
        note="有料トグルは既定 OFF。429 で自動 ON しません。"
      />
      <ServiceCard
        name="Turso"
        state={health.db === "ok" ? "無料枠" : health.db}
        note={health.db}
      />
      <ServiceCard
        name="Vercel"
        state="無料枠"
        note="https://x-idea.vercel.app · hnd1"
      />
    </div>
  );
}

function ServiceCard({
  name,
  state,
  note,
}: {
  name: string;
  state: string;
  note: string;
}) {
  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-paper-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{name}</h2>
        <span className="rounded-full bg-paper px-2 py-0.5 text-ink-2 text-xs">
          {state}
        </span>
      </div>
      <p className="mt-2 text-ink-2 text-sm">{note}</p>
    </article>
  );
}

export default function SettingsPage() {
  return (
    <>
      <main className="px-4 pt-8">
        <p className="text-ink-2 text-sm">Settings</p>
        <h1 className="font-semibold text-2xl">設定</h1>
        <p className="mt-2 mb-6 text-ink-2 text-sm">
          有料プランはすべて OFF です。契約後に人間が切り替えます。
        </p>
        <Suspense fallback={<p className="text-ink-2 text-sm">読み込み中…</p>}>
          <SettingsBody />
        </Suspense>
      </main>
      <TabBar current="/settings" />
    </>
  );
}
