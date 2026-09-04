import { TabBar } from "@/components/TabBar";

export default function AskPage() {
  return (
    <>
      <main className="px-4 pt-8">
        <p className="text-ink-2 text-sm">Ask</p>
        <h1 className="font-semibold text-2xl">聞く</h1>
        <input
          className="mt-6 w-full rounded-full border border-line bg-paper-2 px-4 py-3"
          placeholder="キーワード、または質問"
          disabled
        />
        <p className="mt-4 text-ink-2 text-sm">
          検索と Ask は次のフェーズで有効になります。
        </p>
      </main>
      <TabBar current="/ask" />
    </>
  );
}
