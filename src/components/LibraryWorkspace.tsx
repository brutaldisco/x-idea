"use client";

import { useInfiniteQuery, useIsRestoring } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { PlainMenuSelect } from "@/components/PlainMenuSelect";
import { SourceCard } from "@/components/SourceCard";
import { SourceSortSelect } from "@/components/SourceSortSelect";
import { LIBRARY_SOURCES_KEY } from "@/lib/library-cache";
import {
  applyLibraryVisit,
  beginLibraryLeave,
  beginLibraryRestore,
  canApplyLibraryVisit,
  captureLibraryScroll,
  consumeLibraryReturn,
  libraryHref,
  libraryScrollKey,
  lockBrowserScrollRestoration,
  markLibraryReturn,
  peekLibraryReturn,
  readLibraryVisit,
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
  const filterKey = JSON.stringify(filters);
  const queryKey = useMemo(
    () => [LIBRARY_SOURCES_KEY, sort, filterKey] as const,
    [filterKey, sort],
  );
  const scrollKey = libraryScrollKey({ sort, filters: filterKey, view });
  const returnHref = libraryHref(search);
  const prevScrollKey = useRef(scrollKey);
  if (prevScrollKey.current !== scrollKey) {
    prevScrollKey.current = scrollKey;
    restored.current = false;
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
    refetchOnMount: (entry) => entry.state.data == null,
    refetchOnReconnect: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (restoring || query.data || query.isFetching || query.isError) {
      return;
    }
    const timer = window.setTimeout(() => {
      void query.refetch();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [query.data, query.isError, query.isFetching, query.refetch, restoring]);

  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  const first = query.data?.pages[0];
  const total = first?.count ?? rows.length;
  const label = first?.label ?? "ライブラリ";
  const categories = first?.categories ?? [];
  const infoTypes = first?.infoTypes ?? [];

  useLayoutEffect(() => {
    lockBrowserScrollRestoration();
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
    beginLibraryRestore();
    if (rows.length === 0) {
      return;
    }
    if (
      canApplyLibraryVisit(
        saved,
        document.documentElement.scrollHeight,
        window.innerHeight,
      ) ||
      !query.hasNextPage
    ) {
      if (applyLibraryVisit(saved)) {
        restored.current = true;
      }
    }
  }, [query.hasNextPage, returnHref, router, rows.length, scrollKey]);

  useEffect(() => {
    if (restored.current || query.isFetchingNextPage || restoring) {
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
    query.data?.pages.length,
    query.fetchNextPage,
    query.hasNextPage,
    query.isFetchingNextPage,
    restoring,
    returnHref,
    scrollKey,
  ]);

  useEffect(() => {
    beginLibraryRestore();
    lockBrowserScrollRestoration();
    const delays = [0, 50, 100, 200, 400, 800, 1600, 2800];
    function restore() {
      const saved = readLibraryVisit();
      if (!saved || (saved.key !== scrollKey && saved.href !== returnHref)) {
        return;
      }
      if (rows.length === 0) {
        return;
      }
      if (
        canApplyLibraryVisit(
          saved,
          document.documentElement.scrollHeight,
          window.innerHeight,
        ) ||
        !query.hasNextPage
      ) {
        if (applyLibraryVisit(saved)) {
          restored.current = true;
        }
      }
    }
    const timers = delays.map((ms) => window.setTimeout(restore, ms));
    function onReveal(event: Event) {
      const transition = (
        event as { viewTransition?: { finished?: Promise<void> } }
      ).viewTransition;
      if (transition?.finished) {
        void transition.finished.then(restore);
        return;
      }
      restore();
    }
    window.addEventListener("pagereveal", onReveal);
    window.addEventListener("pageshow", onReveal);
    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      window.removeEventListener("pagereveal", onReveal);
      window.removeEventListener("pageshow", onReveal);
    };
  }, [query.hasNextPage, returnHref, rows.length, scrollKey]);

  useEffect(() => {
    lockBrowserScrollRestoration();
    let frame = 0;
    const pageCount = query.data?.pages.length;
    function persist(leaving: boolean) {
      if (leaving) {
        beginLibraryLeave();
      }
      const y = window.scrollY;
      if (!restored.current && y < 8) {
        return;
      }
      writeLibraryScroll(scrollKey, y, returnHref, { pageCount });
    }
    function onScroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => persist(false));
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
        sourceId: sourceIdFromHref(link.getAttribute("href") ?? link.href),
        pageCount,
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onHide);
    document.addEventListener("pointerdown", onLeaveLibrary, true);
    document.addEventListener("click", onLeaveLibrary, true);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("pointerdown", onLeaveLibrary, true);
      document.removeEventListener("click", onLeaveLibrary, true);
      cancelAnimationFrame(frame);
      persist(true);
    };
  }, [query.data?.pages.length, returnHref, scrollKey]);

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
    const params = new URLSearchParams(search);
    if (next === "grid") {
      params.delete("view");
    } else {
      params.set("view", next);
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
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

  if (query.isPending && rows.length === 0) {
    return <p className="mt-16 text-ink-2 text-sm">読み込み中…</p>;
  }

  return (
    <div className="mt-4 min-w-0 max-w-full">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-ink-2 text-xs">
        <span>
          {label} · {total}件
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
              ? "mt-4 grid min-w-0 grid-cols-2 gap-2 min-[48rem]:grid-cols-3"
              : "mt-4 grid min-w-0 grid-cols-1 gap-3"
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
