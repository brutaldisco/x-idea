"use client";

import {
  keepPreviousData,
  useInfiniteQuery,
  useIsRestoring,
} from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { PlainMenuSelect } from "@/components/PlainMenuSelect";
import { SourceCard } from "@/components/SourceCard";
import { SourceSortSelect } from "@/components/SourceSortSelect";
import {
  isLibrarySourcesData,
  LIBRARY_STALE_MS,
  libraryFilterKey,
  libraryListInconsistent,
  libraryListNeedsMore,
  libraryQueryKey,
} from "@/lib/library-cache";
import { readDeletedSourceIds } from "@/lib/library-deleted";
import { writeLibraryNeighbors } from "@/lib/library-neighbors";
import {
  applyLibraryVisit,
  beginLibraryLeave,
  beginLibraryRestore,
  canApplyLibraryVisit,
  cancelLibraryRestore,
  captureLibraryScroll,
  clearLibraryRestoreCancel,
  consumeLibraryReturn,
  libraryHref,
  libraryScrollKey,
  lockBrowserScrollRestoration,
  markLibraryReturn,
  peekLibraryReturn,
  readLibraryVisit,
  shouldRetryLibraryRestore,
  sourceIdFromHref,
  writeLibraryScroll,
} from "@/lib/library-scroll";
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
  accountId?: string | null;
  label?: string;
  categories?: { id: string; name: string }[];
  infoTypes?: { id: string; name: string }[];
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
  search,
}: {
  name: string;
  value: string;
  emptyLabel: string;
  options: { id: string; label: string }[];
  search: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <PlainMenuSelect
      value={value}
      ariaLabel={emptyLabel}
      options={[{ id: "", label: emptyLabel }, ...options]}
      onChange={(nextValue) => {
        const next = new URLSearchParams(search);
        if (nextValue) {
          next.set(name, nextValue);
        } else {
          next.delete(name);
        }
        const href = next.toString();
        router.push(href ? `${pathname}?${href}` : pathname);
      }}
    />
  );
}

export function LibraryWorkspace({
  sort,
  view,
  filters,
  search,
}: {
  sort: SourceSort;
  view: LibraryView;
  filters: LibraryFilters;
  search: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sentinel = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const userMoved = useRef(false);
  const programmaticScroll = useRef(false);
  const pageCountRef = useRef(0);
  const loadMoreRef = useRef({
    fetchNextPage: (() => undefined) as () => void,
    hasNextPage: false,
    isFetchingNextPage: false,
  });
  const filterKey = libraryFilterKey(filters);
  const queryKey = useMemo(
    () => libraryQueryKey(sort, filterKey),
    [filterKey, sort],
  );
  const scrollKey = libraryScrollKey({ sort, filters: filterKey, view });
  const returnHref = libraryHref(search);
  const prevScrollKey = useRef(scrollKey);
  if (prevScrollKey.current !== scrollKey) {
    prevScrollKey.current = scrollKey;
    restored.current = false;
    userMoved.current = false;
  }

  const restoring = useIsRestoring();
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchPage({
        sort,
        filters,
        cursor: pageParam,
      }),
    enabled: !restoring,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnMount: (entry) => {
      if (entry.state.data == null) {
        return true;
      }
      return (
        isLibrarySourcesData(entry.state.data) &&
        libraryListInconsistent(entry.state.data)
      );
    },
    refetchOnReconnect: false,
    placeholderData: keepPreviousData,
    staleTime: LIBRARY_STALE_MS,
  });

  pageCountRef.current = query.data?.pages.length ?? 0;
  loadMoreRef.current = {
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage: query.isFetchingNextPage,
  };
  const deletedIds = readDeletedSourceIds();
  const rows =
    query.data?.pages
      .flatMap((page) => page.items)
      .filter((item) => !deletedIds.has(item.id)) ?? [];
  const neighborIdsRef = useRef<string[]>([]);
  useEffect(() => {
    const ids =
      query.data?.pages.flatMap((page) => page.items.map((item) => item.id)) ??
      [];
    neighborIdsRef.current = ids;
    if (ids.length > 0) {
      writeLibraryNeighbors(ids);
    }
  }, [query.data]);
  const first = query.data?.pages[0];
  const total = first?.count ?? rows.length;
  const repairedKey = useRef("");
  const queryKeyStr = queryKey.join("\0");
  const label = first?.label ?? "ライブラリ";
  const categories = first?.categories ?? [];
  const infoTypes = first?.infoTypes ?? [];

  useLayoutEffect(() => {
    lockBrowserScrollRestoration();
    if (!pathname.startsWith("/library")) {
      restored.current = false;
      userMoved.current = false;
      clearLibraryRestoreCancel();
      return;
    }
    if (
      !shouldRetryLibraryRestore({
        restored: restored.current,
        userMoved: userMoved.current,
      })
    ) {
      restored.current = true;
      return;
    }
    const saved = readLibraryVisit();
    if (peekLibraryReturn()) {
      consumeLibraryReturn();
      if (saved && returnHref === "/library" && saved.href !== "/library") {
        router.replace(saved.href, { scroll: false });
        return;
      }
    }
    if (!saved || (saved.key !== scrollKey && saved.href !== returnHref)) {
      restored.current = true;
      return;
    }
    if (rows.length === 0) {
      return;
    }
    beginLibraryRestore();
    if (
      canApplyLibraryVisit(
        saved,
        document.documentElement.scrollHeight,
        window.innerHeight,
      ) ||
      !query.hasNextPage
    ) {
      programmaticScroll.current = true;
      if (applyLibraryVisit(saved)) {
        restored.current = true;
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          programmaticScroll.current = false;
        });
      });
    }
  }, [pathname, query.hasNextPage, returnHref, router, rows.length, scrollKey]);

  useEffect(() => {
    if (restoring || query.isFetching || query.isError) {
      return;
    }
    if (!query.data || !libraryListInconsistent(query.data)) {
      return;
    }
    if (repairedKey.current === queryKeyStr) {
      return;
    }
    repairedKey.current = queryKeyStr;
    void query.refetch();
  }, [
    query.data,
    query.isError,
    query.isFetching,
    query.refetch,
    queryKeyStr,
    restoring,
  ]);

  useEffect(() => {
    if (
      restoring ||
      query.isFetchingNextPage ||
      query.isFetching ||
      query.isError
    ) {
      return;
    }
    if (!query.data || !libraryListNeedsMore(query.data)) {
      return;
    }
    void query.fetchNextPage();
  }, [
    query.data,
    query.fetchNextPage,
    query.isError,
    query.isFetching,
    query.isFetchingNextPage,
    restoring,
  ]);

  useEffect(() => {
    if (
      !pathname.startsWith("/library") ||
      restored.current ||
      userMoved.current ||
      query.isFetchingNextPage ||
      restoring
    ) {
      return;
    }
    const saved = readLibraryVisit();
    if (!saved || (saved.key !== scrollKey && saved.href !== returnHref)) {
      return;
    }
    const pages = query.data?.pages.length ?? 0;
    const needPages = saved.pageCount != null && pages < saved.pageCount;
    const needHeight =
      query.hasNextPage &&
      !canApplyLibraryVisit(
        saved,
        document.documentElement.scrollHeight,
        window.innerHeight,
      );
    if (needPages || needHeight) {
      void query.fetchNextPage();
    }
  }, [
    pathname,
    query.data?.pages.length,
    query.fetchNextPage,
    query.hasNextPage,
    query.isFetchingNextPage,
    restoring,
    returnHref,
    scrollKey,
  ]);

  useEffect(() => {
    lockBrowserScrollRestoration();
    let frame = 0;
    function persist(leaving: boolean) {
      if (!pathname.startsWith("/library")) {
        return;
      }
      if (leaving) {
        beginLibraryLeave();
      }
      const y = window.scrollY;
      if (!restored.current && !userMoved.current && y < 8) {
        return;
      }
      writeLibraryScroll(scrollKey, y, returnHref, {
        pageCount: pageCountRef.current,
      });
    }
    function markUserMoved() {
      if (!pathname.startsWith("/library")) {
        return;
      }
      userMoved.current = true;
      restored.current = true;
      cancelLibraryRestore();
    }
    function onScroll() {
      if (
        !programmaticScroll.current &&
        !restored.current &&
        window.scrollY > 8
      ) {
        markUserMoved();
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => persist(false));
    }
    function onWheel() {
      markUserMoved();
    }
    function onTouchMove() {
      markUserMoved();
    }
    function onKey(event: KeyboardEvent) {
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "PageDown" ||
        event.key === "PageUp" ||
        event.key === "Home" ||
        event.key === "End" ||
        event.key === " "
      ) {
        markUserMoved();
      }
    }
    function onHide() {
      if (document.visibilityState && document.visibilityState !== "hidden") {
        return;
      }
      persist(true);
    }
    function onPageHide() {
      markLibraryReturn();
      persist(true);
    }
    function onLeaveLibrary(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const link = target.closest('a[href^="/source/"]');
      if (!(link instanceof HTMLAnchorElement)) {
        return;
      }
      captureLibraryScroll({
        key: scrollKey,
        href: returnHref,
        sourceId:
          sourceIdFromHref(link.getAttribute("href") ?? link.href) ?? undefined,
        pageCount: pageCountRef.current,
      });
      if (neighborIdsRef.current.length > 0) {
        writeLibraryNeighbors(neighborIdsRef.current);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onHide);
    document.addEventListener("pointerdown", onLeaveLibrary, true);
    document.addEventListener("click", onLeaveLibrary, true);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("pointerdown", onLeaveLibrary, true);
      document.removeEventListener("click", onLeaveLibrary, true);
      cancelAnimationFrame(frame);
      persist(true);
    };
  }, [pathname, returnHref, scrollKey]);

  const hasRows = rows.length > 0;
  const observerKey = `${hasRows}:${query.hasNextPage}:${rows.length}`;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !observerKey.startsWith("true:")) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const loadMore = loadMoreRef.current;
        if (
          entries[0]?.isIntersecting &&
          loadMore.hasNextPage &&
          !loadMore.isFetchingNextPage
        ) {
          void loadMore.fetchNextPage();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [observerKey]);

  function setView(next: LibraryView) {
    const params = new URLSearchParams(search);
    if (next === "grid") {
      params.delete("view");
    } else {
      params.set("view", next);
    }
    const queryString = params.toString();
    const base = pathname.startsWith("/library") ? pathname : "/library";
    router.replace(queryString ? `${base}?${queryString}` : base, {
      scroll: false,
    });
  }

  if (query.isError && rows.length === 0) {
    return (
      <p className="mt-16 text-ink-2 text-sm">
        一覧を読めませんでした。
        <button
          type="button"
          className="ml-2 underline"
          onClick={() => {
            void query.refetch();
          }}
        >
          再試行
        </button>
      </p>
    );
  }

  if (rows.length === 0 && (query.isPending || restoring)) {
    return (
      <p className="mt-16 text-ink-2 text-sm">
        {restoring ? "表示を戻しています…" : "読み込み中…"}
      </p>
    );
  }

  return (
    <div className="mt-4 min-w-0 max-w-full">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-ink-2 text-xs">
        <span>
          {label} ·{" "}
          {rows.length > 0 && rows.length < total
            ? `${rows.length} / ${total}件`
            : `${total}件`}
        </span>
        <div className="flex items-center gap-2">
          <SourceSortSelect value={sort} search={search} />
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

      <div className="mt-3 flex min-w-0 max-w-full gap-2 overflow-x-auto pb-1">
        <FilterSelect
          name="category"
          value={filters.categoryId ?? ""}
          emptyLabel="カテゴリ"
          search={search}
          options={categories.map((item) => ({
            id: item.id,
            label: item.name,
          }))}
        />
        <FilterSelect
          name="info_type"
          value={filters.infoType ?? ""}
          emptyLabel="情報タイプ"
          search={search}
          options={infoTypes.map((item) => ({
            id: item.id,
            label: item.name,
          }))}
        />
        <FilterSelect
          name="read"
          value={filters.readStatus ?? ""}
          emptyLabel="状態"
          search={search}
          options={READ_STATUSES.map((id) => ({
            id,
            label: READ_LABELS[id],
          }))}
        />
        <FilterSelect
          name="kind"
          value={filters.kind ?? ""}
          emptyLabel="種類"
          search={search}
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
            view === "grid"
              ? "mt-4 grid min-w-0 grid-cols-2 gap-2 text-wrap min-[48rem]:grid-cols-3"
              : "mt-4 grid min-w-0 grid-cols-1 gap-3 text-wrap"
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
              videoSaveStatus={item.videoSaveStatus}
              videoRelPath={item.videoRelPath}
              lang={item.lang}
              summaryFromAi={item.summaryFromAi}
              postedAt={item.postedAt}
              variant={view === "grid" ? "grid" : "list"}
            />
          ))}
        </ul>
      )}
      <div ref={sentinel} className="h-8" />
      <p
        className={`py-3 text-center text-ink-2 text-xs ${
          query.isFetchingNextPage ? "" : "invisible"
        }`}
      >
        読み込み中…
      </p>
      {query.hasNextPage && !query.isFetchingNextPage ? (
        <button
          type="button"
          className="mx-auto block py-2 text-ink-2 text-xs underline"
          onClick={() => {
            void query.fetchNextPage();
          }}
        >
          続きを読み込む
        </button>
      ) : null}
      {rows.length < total && !query.hasNextPage && !query.isFetching ? (
        <button
          type="button"
          className="mx-auto block py-2 text-ink-2 text-xs underline"
          onClick={() => {
            void query.refetch();
          }}
        >
          一覧を再読み込み
        </button>
      ) : null}
      {query.isError ? (
        <p className="py-3 text-center text-ink-2 text-xs">
          続きを読めませんでした。
        </p>
      ) : null}
    </div>
  );
}
