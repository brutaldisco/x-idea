import { TabBar } from "@/components/TabBar";

export default function InboxPage() {
  return (
    <>
      <main className="px-4 pt-8">
        <p className="text-ink-2 text-sm">Inbox</p>
        <h1 className="font-semibold text-2xl">要確認</h1>
        <p className="mt-16 text-center text-ink-2">
          Inbox は空です。ライブラリへどうぞ。
        </p>
      </main>
      <TabBar current="/inbox" />
    </>
  );
}
