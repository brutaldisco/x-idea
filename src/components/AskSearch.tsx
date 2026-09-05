"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SourceCard } from "@/components/SourceCard";
import type { SourceListItem } from "@/server/sources/query";

export function AskSearch({
  targetLabel,
  targetCount,
  initialQuery,
  initialItems,
}: {
  targetLabel: string;
  targetCount: number;
  initialQuery: string;
  initialItems: SourceListItem[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState(initialItems);
  const [suggests, setSuggests] = useState<SourceListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(initialQuery.length > 0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setQuery(initialQuery);
    setItems(initialItems);
    setSearched(initialQuery.length > 0);
  }, [initialQuery, initialItems]);

  useEffect(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
    }
    const q = query.trim();
    if (q.length < 2) {
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
  }, [query]);

  async function runSearch(next: string) {
    const q = next.trim();
    setOpen(false);
    setBusy(true);
    setSearched(true);
    router.replace(q ? `/ask?q=${encodeURIComponent(q)}` : "/ask");
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
      <p className="mt-2 text-ink-2 text-xs">
        検索対象: {targetLabel}（{targetCount}件） · Enter で一覧。AI
        に聞くは次の段階です。
      </p>
      {open && suggests.length > 0 ? (
        <ul className="mt-2 overflow-hidden rounded-2xl border border-line bg-paper">
          {suggests.map((item) => (
            <li key={item.id} className="border-line border-b last:border-b-0">
              <Link
                href={`/source/${item.id}`}
                className="block truncate px-4 py-2 text-sm hover:bg-paper-2"
                onClick={() => setOpen(false)}
              >
                {item.authorUsername ? `@${item.authorUsername} · ` : ""}
                {item.summary}
              </Link>
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
        <ul className="mt-6 space-y-3">
          {items.map((item) => (
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
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
