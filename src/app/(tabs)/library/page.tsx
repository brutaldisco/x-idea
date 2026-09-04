import { TabBar } from "@/components/TabBar";

export default function LibraryPage() {
  return (
    <>
      <main className="px-4 pt-8">
        <p className="text-ink-2 text-sm">Library</p>
        <h1 className="font-semibold text-2xl">ライブラリ</h1>
        <p className="mt-16 text-center text-ink-2">
          保存した Source がここに並びます。
        </p>
      </main>
      <TabBar current="/library" />
    </>
  );
}
