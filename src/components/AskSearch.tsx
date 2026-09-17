"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SourceCard } from "@/components/SourceCard";
import { SourceThumbFallback } from "@/components/SourceThumbFallback";
import { VideoThumbMarks } from "@/components/VideoThumbMarks";
import type { LibraryView } from "@/lib/source-filters";
import type { TaxonomyChipItem } from "@/lib/taxonomy-chip";
import type { SourceListItem } from "@/server/sources/query";

function askHref(q: string, view: LibraryView): string {
  const params = new URLSearchParams();
  if (q) {
    params.set("q", q);
  }
  if (view === "list") {
    params.set("view", "list");
  }
  const query = params.toString();
  return query ? `/ask?${query}` : "/ask";
}

function mediaThumbUrl(
  mediaId: string | null,
  mediaType: string | null,
): string | null {
  if (!mediaId) {
    return null;
  }
  return mediaType === "photo"
    ? `/api/media/${mediaId}`
    : `/api/media/${mediaId}?preview=1`;
}

function AskSuggestRow({
  item,
  onPick,
}: {
  item: SourceListItem;
  onPick: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const thumbUrl = mediaThumbUrl(item.mediaId, item.mediaType);
  const showImage = Boolean(thumbUrl) && !imageFailed;

  return (
    <Link
      href={`/source/${item.id}`}
      transitionTypes={["nav-forward"]}
      className="flex gap-3 px-3 py-2 hover:bg-paper-2"
      onClick={onPick}
    >
      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-paper">
        {showImage && thumbUrl ? (
          <Image
            src={thumbUrl}
            alt=""
            width={56}
            height={56}
            unoptimized
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <SourceThumbFallback
            sourceId={item.id}
            authorAvatarUrl={item.authorAvatarUrl}
            authorName={item.authorName}
            authorUsername={item.authorUsername}
            avatarSize="sm"
            shareTransition={false}
            className="h-full w-full"
          />
        )}
        <VideoThumbMarks
          mediaType={item.mediaType}
          saveStatus={item.videoSaveStatus}
          durationMs={item.durationMs}
        />
      </span>
      <span className="min-w-0 flex-1">
        {item.authorUsername ? (
          <span className="block truncate text-ink-2 text-xs">
            @{item.authorUsername}
          </span>
        ) : null}
        <span className="line-clamp-2 text-sm">{item.summary}</span>
      </span>
    </Link>
  );
}

function AskResultCard({
  item,
  accountId,
  categories,
  infoTypes,
  variant,
}: {
  item: SourceListItem;
  accountId: string | null;
  categories: TaxonomyChipItem[];
  infoTypes: TaxonomyChipItem[];
  variant: "list" | "grid";
}) {
  return (
    <SourceCard
      id={item.id}
      categoryId={item.categoryId}
      infoType={item.infoType}
      categories={categories}
      infoTypes={infoTypes}
      summary={item.summary}
      url={item.url}
      authorAvatarUrl={item.authorAvatarUrl}
      authorName={item.authorName}
      authorUsername={item.authorUsername}
      mediaId={item.mediaId}
      mediaType={item.mediaType}
      videoSaveStatus={item.videoSaveStatus}
      videoRelPath={item.videoRelPath}
      durationMs={item.durationMs}
      accountId={accountId}
      kind={item.kind}
      hasQueueableVideos={item.hasQueueableVideos}
      lang={item.lang}
      summaryFromAi={item.summaryFromAi}
      postedAt={item.postedAt}
      variant={variant}
      avatarFallback
    />
  );
}

export function AskSearch({
  targetLabel,
  targetCount,
  accountId,
  initialQuery,
  initialItems,
  initialView = "grid",
  categories = [],
  infoTypes = [],
}: {
  targetLabel: string;
  targetCount: number;
  accountId: string | null;
  initialQuery: string;
  initialItems: SourceListItem[];
  initialView?: LibraryView;
  categories?: TaxonomyChipItem[];
  infoTypes?: TaxonomyChipItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState(initialItems);
  const [view, setViewState] = useState<LibraryView>(initialView);
  const [suggests, setSuggests] = useState<SourceListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(initialQuery.length > 0);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery.trim());
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
    setItems(initialItems);
    setSearched(initialQuery.length > 0);
    setSubmittedQuery(initialQuery.trim());
  }, [initialQuery, initialItems]);

  useEffect(() => {
    setViewState(initialView);
  }, [initialView]);

  useEffect(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
    }
    const q = query.trim();
    if (q.length < 2 || q === submittedQuery) {
      setSuggests([]);
      setOpen(false);
      return;
    }
    timer.current = window.setTimeout(() => {
      void fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`)
        .then(async (res) => {
          if (!res.ok) {
            return;
          }
          const body = (await res.json()) as { items?: SourceListItem[] };
          setSuggests(body.items ?? []);
          setOpen(true);
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
    };
  }, [query, submittedQuery]);

  async function runSearch(next: string) {
    const q = next.trim();
    setOpen(false);
    setBusy(true);
    setSearched(true);
    setSubmittedQuery(q);
    router.replace(askHref(q, view));
    try {
      if (!q) {
        setItems([]);
        return;
      }
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setItems([]);
        return;
      }
      const body = (await res.json()) as { items?: SourceListItem[] };
      setItems(body.items ?? []);
    } finally {
      setBusy(false);
    }
  }

  function setView(next: LibraryView) {
    setViewState(next);
    router.replace(askHref(query.trim(), next), { scroll: false });
  }

  return (
    <div className="mt-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(query);
        }}
      >
        <input
          className="w-full rounded-full border border-line bg-paper-2 px-4 py-3"
          placeholder="キーワードで探す"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (suggests.length > 0) {
              setOpen(true);
            }
          }}
          enterKeyHint="search"
        />
      </form>
      <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="text-ink-2 text-xs">
          検索対象: {targetLabel}（{targetCount}件） · Enter で一覧。AI
          に聞くは次の段階です。
        </p>
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
      {open && suggests.length > 0 ? (
        <ul className="mt-2 overflow-hidden rounded-2xl border border-line bg-paper">
          {suggests.map((item) => (
            <li key={item.id} className="border-line border-b last:border-b-0">
              <AskSuggestRow item={item} onPick={() => setOpen(false)} />
            </li>
          ))}
        </ul>
      ) : null}
      {busy ? <p className="mt-6 text-ink-2 text-sm">検索中…</p> : null}
      {!busy && searched && items.length === 0 ? (
        <p className="mt-10 text-center text-ink-2 text-sm">
          保存情報には見つかりませんでした。
        </p>
      ) : null}
      {!busy && items.length > 0 ? (
        <ul
          className={
            view === "grid"
              ? "mt-4 grid min-w-0 grid-cols-2 gap-2 text-wrap min-[48rem]:grid-cols-3"
              : "mt-4 grid min-w-0 grid-cols-1 gap-3 text-wrap"
          }
        >
          {items.map((item) => (
            <AskResultCard
              key={item.id}
              item={item}
              accountId={accountId}
              categories={categories}
              infoTypes={infoTypes}
              variant={view}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
