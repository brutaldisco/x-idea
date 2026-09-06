"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { SourceCard } from "@/components/SourceCard";
import { SourceSortSelect } from "@/components/SourceSortSelect";
import {
  hasLibraryFilters,
  type LibraryFilters,
  type LibraryView,
  SOURCE_KINDS,
} from "@/lib/source-filters";
import type { SourceSort } from "@/lib/source-sort";
import type { SourceListItem } from "@/server/sources/query";
import { READ_STATUSES } from "@/server/sources/triage";

const READ_LABELS: Record<(typeof READ_STATUSES)[number], string> = {
  unread: "未読",
  read: "読了",
  to_practice: "実践予定",
  practiced: "実践済",
  knowledged: "KC化",
};

type Page = {
  items: SourceListItem[];
  nextCursor: string | null;
  count: number | null;
};

async function fetchPage(input: {
  sort: SourceSort;
  filters: LibraryFilters;
  cursor?: string;
}): Promise<Page> {
  const params = new URLSearchParams();
  if (input.sort !== "posted_desc") {
    params.set("sort", input.sort);
  }
  if (input.cursor) {
    params.set("cursor", input.cursor);
  }
  if (input.filters.categoryId) {
    params.set("category", input.filters.categoryId);
  }
  if (input.filters.infoType) {
    params.set("info_type", input.filters.infoType);
  }
  if (input.filters.readStatus) {
    params.set("read", input.filters.readStatus);
  }
  if (input.filters.kind) {
    params.set("kind", input.filters.kind);
  }
  if (input.filters.tag) {
    params.set("tag", input.filters.tag);
  }
  const res = await fetch(`/api/sources?${params.toString()}`, {
    credentials: "same-origin",
  });
  if (!res.ok) {
    throw new Error("一覧を読めませんでした");
  }
  return (await res.json()) as Page;
}

function FilterSelect({
  name,
  value,
  emptyLabel,
  options,
}: {
  name: string;
  value: string;
  emptyLabel: string;
  options: { id: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <select
      value={value}
      aria-label={emptyLabel}
      onChange={(event) => {
        const next = new URLSearchParams(searchParams.toString());
        if (event.target.value) {
          next.set(name, event.target.value);
        } else {
          next.delete(name);
        }
        const query = next.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
      }}
      className="max-w-[9.5rem] shrink-0 rounded-full border border-line bg-paper px-2 py-1.5 text-xs"
    >
      <option value="">{emptyLabel}</option>
      {options.map((item) => (
        <option key={item.id} value={item.id}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

export function LibraryWorkspace({
  items,
  nextCursor,
  count,
  label,
  sort,
  view,
  filters,
  categories,
  infoTypes,
}: {
  items: SourceListItem[];
  nextCursor: string | null;
  count: number;
  label: string;
  sort: SourceSort;
  view: LibraryView;
  filters: LibraryFilters;
  categories: { id: string; name: string }[];
  infoTypes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sentinel = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const filterKey = JSON.stringify(filters);
  const queryKey = useMemo(
    () => ["sources", sort, filterKey] as const,
    [filterKey, sort],
  );
  useEffect(() => {
    queryClient.setQueryData(queryKey, {
      pages: [{ items, nextCursor, count }],
      pageParams: [undefined],
    });
  }, [count, items, nextCursor, queryClient, queryKey]);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchPage({
        sort,
        filters,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialData: {
      pages: [{ items, nextCursor, count }],
      pageParams: [undefined],
    },
  });

  const rows = query.data?.pages.flatMap((page) => page.items) ?? items;
  const total = query.data?.pages[0]?.count ?? count;

  useEffect(() => {
    const node = sentinel.current;
    if (!node) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          query.hasNextPage &&
          !query.isFetchingNextPage
        ) {
          void query.fetchNextPage();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [query.fetchNextPage, query.hasNextPage, query.isFetchingNextPage]);

  function setView(next: LibraryView) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "grid") {
      params.delete("view");
    } else {
      params.set("view", next);
    }
    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-ink-2 text-xs">
        <span>
          {label} · {total}件
        </span>
        <div className="flex items-center gap-2">
          <SourceSortSelect value={sort} />
          <fieldset className="m-0 flex min-w-0 rounded-full border border-line p-0.5">
            <legend className="sr-only">表示</legend>
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={`min-h-8 rounded-full px-3 text-xs ${
                view === "list" ? "bg-ink text-paper" : ""
              }`}
            >
              リスト
            </button>
            <button
              type="button"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
              className={`min-h-8 rounded-full px-3 text-xs ${
                view === "grid" ? "bg-ink text-paper" : ""
              }`}
            >
              グリッド
            </button>
          </fieldset>
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <FilterSelect
          name="category"
          value={filters.categoryId ?? ""}
          emptyLabel="カテゴリ"
          options={categories.map((item) => ({
            id: item.id,
            label: item.name,
          }))}
        />
        <FilterSelect
          name="info_type"
          value={filters.infoType ?? ""}
          emptyLabel="情報タイプ"
          options={infoTypes.map((item) => ({
            id: item.id,
            label: item.name,
          }))}
        />
        <FilterSelect
          name="read"
          value={filters.readStatus ?? ""}
          emptyLabel="状態"
          options={READ_STATUSES.map((id) => ({
            id,
            label: READ_LABELS[id],
          }))}
        />
        <FilterSelect
          name="kind"
          value={filters.kind ?? ""}
          emptyLabel="種類"
          options={[...SOURCE_KINDS]}
        />
      </div>

      {rows.length === 0 ? (
        <p className="mt-16 text-center text-ink-2">
          {hasLibraryFilters(filters)
            ? "条件に合う Source はありません。"
            : `${label}に保存した Source はまだありません。`}
        </p>
      ) : (
        <ul
          className={
            view === "grid" ? "mt-4 grid grid-cols-3 gap-2" : "mt-4 space-y-3"
          }
        >
          {rows.map((item) => (
            <SourceCard
              key={item.id}
              id={item.id}
              authorUsername={item.authorUsername}
              summary={item.summary}
              url={item.url}
              mediaId={item.mediaId}
              mediaType={item.mediaType}
              lang={item.lang}
              summaryFromAi={item.summaryFromAi}
              postedAt={item.postedAt}
              variant={view === "grid" ? "grid" : "list"}
            />
          ))}
        </ul>
      )}
      <div ref={sentinel} className="h-8" />
      {query.isFetchingNextPage ? (
        <p className="py-3 text-center text-ink-2 text-xs">読み込み中…</p>
      ) : null}
      {query.isError ? (
        <p className="py-3 text-center text-ink-2 text-xs">
          続きを読めませんでした。
        </p>
      ) : null}
    </div>
  );
}
