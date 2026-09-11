"use client";

import {
  keepPreviousData,
  useIsRestoring,
  useQuery,
} from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { PlainMenuSelect } from "@/components/PlainMenuSelect";
import { SourceCard } from "@/components/SourceCard";
import { SourceSortSelect } from "@/components/SourceSortSelect";
import {
  LIBRARY_STALE_MS,
  libraryFilterKey,
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
  libraryPageSlots,
  SOURCE_PAGE_SIZE,
  sourcePageCount,
  withLibraryPage,
} from "@/lib/source-cursor";
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
  page: number;
}): Promise<Page> {
  const params = new URLSearchParams();
  params.set("limit", String(SOURCE_PAGE_SIZE));
  if (input.page > 1) {
    params.set("page", String(input.page));
  } else {
    params.set("page", "1");
  }
  if (input.sort !== "posted_desc") {
    params.set("sort", input.sort);
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

function LibraryCardSkeleton({ view }: { view: LibraryView }) {
  if (view === "grid") {
    return (
      <li
        className="min-w-0 w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper-2 p-2"
        aria-hidden
      >
        <span className="mb-1.5 block h-[112px] w-full animate-pulse rounded-lg bg-paper" />
        <span className="mt-1 block h-3 w-1/3 animate-pulse rounded bg-line" />
        <span className="mt-2 block h-3 w-full animate-pulse rounded bg-line" />
        <span className="mt-1.5 block h-3 w-2/3 animate-pulse rounded bg-line" />
      </li>
    );
  }
  return (
    <li
      className="min-w-0 w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper-2 p-4"
      aria-hidden
    >
      <div className="flex min-w-0 gap-3">
        <span className="h-20 w-20 shrink-0 animate-pulse rounded-lg bg-paper" />
        <div className="min-w-0 flex-1">
          <span className="block h-3 w-24 animate-pulse rounded bg-line" />
          <span className="mt-2 block h-3 w-full animate-pulse rounded bg-line" />
          <span className="mt-1.5 block h-3 w-5/6 animate-pulse rounded bg-line" />
        </div>
      </div>
    </li>
  );
}

const LIST_SKELETON_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const GRID_SKELETON_KEYS = [...LIST_SKELETON_KEYS, "i", "j", "k", "l"] as const;

function LibraryPageSkeleton({ view }: { view: LibraryView }) {
  const keys = view === "grid" ? GRID_SKELETON_KEYS : LIST_SKELETON_KEYS;
  return (
    <ul
      aria-busy="true"
      aria-label="読み込み中"
      className={
        view === "grid"
          ? "mt-4 grid min-w-0 grid-cols-2 gap-2 text-wrap min-[48rem]:grid-cols-3"
          : "mt-4 grid min-w-0 grid-cols-1 gap-3 text-wrap"
      }
    >
      {keys.map((key) => (
        <LibraryCardSkeleton key={key} view={view} />
      ))}
    </ul>
  );
}

function LibraryPager({
  page,
  totalPages,
  busy,
  onGoToPage,
  ariaLabel,
}: {
  page: number;
  totalPages: number;
  busy: boolean;
  onGoToPage: (page: number) => void;
  ariaLabel: string;
}) {
  if (totalPages <= 1) {
    return null;
  }
  const slots = libraryPageSlots(page, totalPages);
  return (
    <nav
      aria-label={ariaLabel}
      className="flex flex-wrap items-center justify-center gap-1.5 text-ink-2 text-xs"
    >
      <button
        type="button"
        disabled={page <= 1 || busy}
        className="min-h-8 rounded-full border border-line px-3 disabled:opacity-40"
        onClick={() => onGoToPage(page - 1)}
      >
        前へ
      </button>
      {slots.map((slot, index) => {
        if (slot === "gap") {
          const prev = slots[index - 1];
          return (
            <span key={`gap-${prev}`} className="px-1" aria-hidden>
              …
            </span>
          );
        }
        const current = slot === page;
        return (
          <button
            key={slot}
            type="button"
            aria-label={`ページ ${slot}`}
            aria-current={current ? "page" : undefined}
            disabled={busy || current}
            onClick={() => onGoToPage(slot)}
            className={`min-h-8 min-w-8 rounded-full px-2 disabled:opacity-100 ${
              current
                ? "bg-ink text-paper"
                : "border border-line hover:bg-paper-2"
            }`}
          >
            {slot}
          </button>
        );
      })}
      <button
        type="button"
        disabled={page >= totalPages || busy}
        className="min-h-8 rounded-full border border-line px-3 disabled:opacity-40"
        onClick={() => onGoToPage(page + 1)}
      >
        次へ
      </button>
    </nav>
  );
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
        next.delete("page");
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
  page,
  search,
}: {
  sort: SourceSort;
  view: LibraryView;
  filters: LibraryFilters;
  page: number;
  search: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const restored = useRef(false);
  const userMoved = useRef(false);
  const programmaticScroll = useRef(false);
  const filterKey = libraryFilterKey(filters);
  const queryKey = useMemo(
    () => libraryQueryKey(sort, filterKey, page),
    [filterKey, page, sort],
  );
  const scrollKey = libraryScrollKey({
    sort,
    filters: filterKey,
    view,
    page,
  });
  const returnHref = libraryHref(search);
  const prevScrollKey = useRef(scrollKey);
  if (prevScrollKey.current !== scrollKey) {
    prevScrollKey.current = scrollKey;
    restored.current = false;
    userMoved.current = false;
  }

  const restoring = useIsRestoring();
  const query = useQuery({
    queryKey,
    queryFn: () => fetchPage({ sort, filters, page }),
    enabled: !restoring,
    refetchOnMount: (entry) => entry.state.data == null,
    refetchOnReconnect: false,
    placeholderData: keepPreviousData,
    staleTime: LIBRARY_STALE_MS,
  });

  const deletedIds = readDeletedSourceIds();
  const rows = (query.data?.items ?? []).filter(
    (item) => !deletedIds.has(item.id),
  );
  const neighborIdsRef = useRef<string[]>([]);
  const itemIds = (query.data?.items ?? []).map((item) => item.id).join(",");
  const paging = query.isPlaceholderData;
  useEffect(() => {
    if (paging) {
      return;
    }
    const ids = itemIds ? itemIds.split(",") : [];
    neighborIdsRef.current = ids;
    if (ids.length > 0) {
      writeLibraryNeighbors(ids);
    }
  }, [itemIds, paging]);

  const total = query.data?.count ?? rows.length;
  const totalPages = sourcePageCount(total);
  const safePage = Math.min(page, totalPages);
  const label = query.data?.label ?? "ライブラリ";
  const categories = query.data?.categories ?? [];
  const infoTypes = query.data?.infoTypes ?? [];
  const rangeStart = total === 0 ? 0 : (safePage - 1) * SOURCE_PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, safePage * SOURCE_PAGE_SIZE);

  useEffect(() => {
    if (query.isFetching || query.isError || total === 0) {
      return;
    }
    if (page > totalPages) {
      const href = withLibraryPage(search, totalPages);
      const base = pathname.startsWith("/library") ? pathname : "/library";
      router.replace(href ? `${base}?${href}` : base, { scroll: false });
    }
  }, [
    page,
    pathname,
    query.isError,
    query.isFetching,
    router,
    search,
    total,
    totalPages,
  ]);

  const prevPage = useRef(page);
  useLayoutEffect(() => {
    if (prevPage.current === page) {
      return;
    }
    prevPage.current = page;
    if (peekLibraryReturn()) {
      return;
    }
    programmaticScroll.current = true;
    window.scrollTo(0, 0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        programmaticScroll.current = false;
      });
    });
  }, [page]);

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
      )
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
  }, [pathname, returnHref, router, rows.length, scrollKey]);

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
      writeLibraryScroll(scrollKey, y, returnHref, { pageCount: 1 });
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
        pageCount: 1,
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

  function goToPage(nextPage: number) {
    const href = withLibraryPage(search, nextPage);
    const base = pathname.startsWith("/library") ? pathname : "/library";
    router.push(href ? `${base}?${href}` : base, { scroll: false });
  }

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
          {total > 0 ? `${rangeStart}–${rangeEnd} / ${total}件` : `${total}件`}
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

      <div className="mt-4">
        <LibraryPager
          page={safePage}
          totalPages={totalPages}
          busy={query.isFetching}
          onGoToPage={goToPage}
          ariaLabel="ページ（上）"
        />
      </div>

      {paging ? (
        <LibraryPageSkeleton view={view} />
      ) : rows.length === 0 ? (
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
              kind={item.kind}
              hasQueueableVideos={item.hasQueueableVideos}
              lang={item.lang}
              summaryFromAi={item.summaryFromAi}
              postedAt={item.postedAt}
              variant={view === "grid" ? "grid" : "list"}
            />
          ))}
        </ul>
      )}

      <div className="mt-6">
        <LibraryPager
          page={safePage}
          totalPages={totalPages}
          busy={query.isFetching}
          onGoToPage={goToPage}
          ariaLabel="ページ（下）"
        />
      </div>

      {query.isError ? (
        <p className="py-3 text-center text-ink-2 text-xs">
          一覧を読めませんでした。
        </p>
      ) : null}
    </div>
  );
}
