import { LibraryWorkspace } from "@/components/LibraryWorkspace";
import { parseLibraryFilters, parseLibraryView } from "@/lib/source-filters";
import { parseSourceSort } from "@/lib/source-sort";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] =>
      Boolean(entry[1]),
    ),
  );
  return (
    <main className="min-w-0 overflow-x-clip px-4 pt-8">
      <h1 className="font-semibold text-2xl">Library</h1>
      <form action="/ask" className="mt-4">
        <input
          name="q"
          className="w-full rounded-full border border-line bg-paper-2 px-4 py-2 text-sm"
          placeholder="ライブラリを検索（Ask）"
        />
      </form>
      <LibraryWorkspace
        sort={parseSourceSort(params.sort)}
        view={parseLibraryView(params.view)}
        filters={parseLibraryFilters(query)}
        search={query.toString()}
      />
    </main>
  );
}
