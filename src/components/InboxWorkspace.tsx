"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { SourceSortSelect } from "@/components/SourceSortSelect";
import { SwipeCard } from "@/components/SwipeCard";
import { translatableProps } from "@/lib/chrome-translate";
import { formatCardDate } from "@/lib/datetime";
import type { SourceSort } from "@/lib/source-sort";
import { sourceTransitionStyle } from "@/lib/view-transition";
import {
  archiveSource,
  bulkConfirm,
  confirmSource,
  restoreSource,
  snoozeSource,
} from "@/server/actions/sources";
import type { InboxListItem } from "@/server/sources/query";
import type { SourceSnapshot } from "@/server/sources/triage";

function thumbSrc(mediaId: string, mediaType: string | null): string {
  return mediaType === "photo"
    ? `/api/media/${mediaId}`
    : `/api/media/${mediaId}?preview=1`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function looksBulkConfirmable(item: InboxListItem, min = 0.7): boolean {
  const confidence =
    item.categoryConfidence ?? item.candidates[0]?.confidence ?? null;
  return Boolean(
    (item.categoryId || item.candidates[0]) &&
      confidence != null &&
      confidence >= min,
  );
}

type MutationResult =
  | { ok: true; data?: { snapshot?: SourceSnapshot } | object }
  | { ok: false; error: { message: string } };

export function InboxWorkspace({
  items,
  label,
  bulkCount,
  sort,
}: {
  items: InboxListItem[];
  label: string;
  bulkCount: number;
  sort: SourceSort;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [queue, setQueue] = useState(items);
  const [optimisticQueue, applyOptimistic] = useOptimistic(
    queue,
    (state, action: { type: "dismiss"; ids: string[] }) => {
      const ids = new Set(action.ids);
      return state.filter((item) => !ids.has(item.id));
    },
  );
  const [message, setMessage] = useState<string | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [undo, setUndo] = useState<{
    snapshot: SourceSnapshot;
    item: InboxListItem;
    label: string;
  } | null>(null);
  const current = optimisticQueue[0] ?? null;
  const next = optimisticQueue[1] ?? null;
  const remaining = optimisticQueue.length;

  useEffect(() => {
    setQueue(items);
  }, [items]);

  useEffect(() => {
    if (!undo) {
      return;
    }
    const timer = window.setTimeout(() => setUndo(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const firstCandidate = current?.candidates[0] ?? null;
  const confirmHint = useMemo(() => {
    if (!current) {
      return "確定";
    }
    if (firstCandidate) {
      return `${firstCandidate.name}で確定`;
    }
    if (current.categoryName) {
      return `${current.categoryName}で確定`;
    }
    return "カテゴリなしで確定";
  }, [current, firstCandidate]);

  function run(
    labelText: string,
    fn: () => Promise<MutationResult>,
    ids: string[],
    item?: InboxListItem,
  ) {
    if (pending) {
      return;
    }
    setMessage(null);
    setRetry(null);
    startTransition(async () => {
      if (ids.length > 0) {
        applyOptimistic({ type: "dismiss", ids });
      }
      const result = await fn();
      if (!result.ok) {
        setMessage(
          `${result.error?.message ?? "操作に失敗しました"} 再試行できます。`,
        );
        setRetry(() => () => run(labelText, fn, ids, item));
        return;
      }
      if (ids.length > 0) {
        setQueue((prev) => prev.filter((row) => !ids.includes(row.id)));
      }
      const snapshot =
        result.data &&
        typeof result.data === "object" &&
        "snapshot" in result.data
          ? result.data.snapshot
          : undefined;
      if (snapshot && item) {
        setUndo({ snapshot, item, label: labelText });
      }
      router.refresh();
    });
  }

  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!current || pending) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        router.push(`/source/${current.id}`, {
          transitionTypes: ["nav-forward"],
        });
        return;
      }
      if (event.key === "e" || event.key === "E") {
        event.preventDefault();
        runRef.current(
          "アーカイブ",
          () => archiveSource(current.id),
          [current.id],
          current,
        );
        return;
      }
      if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        runRef.current(
          "後で",
          () => snoozeSource({ id: current.id }),
          [current.id],
          current,
        );
        return;
      }
      if (event.key === "j" || event.key === "J") {
        event.preventDefault();
        setQueue((prev) =>
          prev.length > 1 ? [...prev.slice(1), prev[0]] : prev,
        );
        return;
      }
      if (event.key === "k" || event.key === "K") {
        event.preventDefault();
        setQueue((prev) =>
          prev.length > 1
            ? [prev[prev.length - 1], ...prev.slice(0, -1)]
            : prev,
        );
        return;
      }
      const index = Number(event.key) - 1;
      const chip = current.candidates[index];
      if (chip) {
        event.preventDefault();
        runRef.current(
          chip.name,
          () => confirmSource({ id: current.id, category_id: chip.categoryId }),
          [current.id],
          current,
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, pending, router]);

  if (!current) {
    return (
      <div className="mt-16 text-center">
        <p className="text-ink-2">
          {label}の Inbox は空です。ライブラリへどうぞ。
        </p>
        <Link
          href="/library"
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-ink px-4 text-paper text-sm"
        >
          ライブラリを開く
        </Link>
      </div>
    );
  }

  const textAttrs = translatableProps(current.lang, current.summaryFromAi);
  const dateLabel = formatCardDate(current.postedAt);
  const confirmCategoryId =
    firstCandidate?.categoryId ?? current.categoryId ?? undefined;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-ink-2 text-xs">
        <span>
          {label} · 残り{remaining}件
        </span>
        <SourceSortSelect value={sort} />
      </div>
      {bulkCount > 0 ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const ids = queue
              .filter((item) => looksBulkConfirmable(item))
              .map((item) => item.id);
            run("一括確定", () => bulkConfirm({ minConfidence: 0.7 }), ids);
          }}
          className="mt-3 min-h-11 w-full rounded-full border border-line px-3 py-2 text-left text-ink text-xs leading-snug hover:bg-paper-2"
        >
          確信度 ≥ 70% を第一候補で一括確定（{bulkCount}件）
        </button>
      ) : null}

      <div className="relative mt-4">
        {next ? (
          <div
            aria-hidden
            className="absolute inset-x-2 top-2 -z-10 min-h-48 rounded-[var(--radius-card)] border border-line bg-paper-2 opacity-70"
          />
        ) : null}
        <SwipeCard
          disabled={pending}
          onConfirm={() =>
            run(
              confirmHint,
              () =>
                confirmSource({
                  id: current.id,
                  category_id: confirmCategoryId,
                }),
              [current.id],
              current,
            )
          }
          onArchive={() =>
            run(
              "アーカイブ",
              () => archiveSource(current.id),
              [current.id],
              current,
            )
          }
          onSnooze={() =>
            run(
              "後で",
              () => snoozeSource({ id: current.id }),
              [current.id],
              current,
            )
          }
          onOpen={() =>
            router.push(`/source/${current.id}`, {
              transitionTypes: ["nav-forward"],
            })
          }
        >
          <div className="flex gap-3">
            {current.mediaId ? (
              <div
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-paper"
                style={sourceTransitionStyle(current.id)}
              >
                <Image
                  src={thumbSrc(current.mediaId, current.mediaType)}
                  alt=""
                  width={160}
                  height={160}
                  unoptimized
                  className="h-full w-full object-cover"
                />
                {current.mediaType && current.mediaType !== "photo" ? (
                  <span className="absolute right-1 bottom-1 rounded bg-ink/80 px-1 text-[10px] text-paper">
                    動画
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              {current.authorUsername ? (
                <p className="truncate text-ink-2 text-xs">
                  @{current.authorUsername}
                </p>
              ) : null}
              {dateLabel ? (
                <p
                  className="notranslate text-ink-2 text-xs tabular-nums"
                  lang="ja"
                >
                  {dateLabel}
                </p>
              ) : null}
              <p className="mt-1 line-clamp-4 text-sm" {...textAttrs}>
                {current.summary}
              </p>
            </div>
          </div>
          {current.uncertaintyReason ? (
            <p className="mt-3 text-ink-2 text-xs">
              迷った理由：{current.uncertaintyReason}
            </p>
          ) : null}
          {current.candidates.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {current.candidates.map((chip, index) => (
                <li key={chip.categoryId}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        chip.name,
                        () =>
                          confirmSource({
                            id: current.id,
                            category_id: chip.categoryId,
                          }),
                        [current.id],
                        current,
                      )
                    }
                    className="min-h-9 rounded-full bg-ai-soft px-3 text-ai text-xs"
                  >
                    {index + 1} {chip.name} {pct(chip.confidence)}
                  </button>
                </li>
              ))}
            </ul>
          ) : current.categoryName ? (
            <p className="mt-3 text-ink-2 text-xs">
              候補：{current.categoryName}
              {current.categoryConfidence != null
                ? ` ${pct(current.categoryConfidence)}`
                : ""}
            </p>
          ) : null}
          {current.tags.length > 0 ? (
            <p className="mt-2 text-ink-2 text-xs">
              {current.tags.join(" · ")}
            </p>
          ) : null}
        </SwipeCard>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              "アーカイブ",
              () => archiveSource(current.id),
              [current.id],
              current,
            )
          }
          className="min-h-11 rounded-full border border-line text-sm"
        >
          アーカイブ
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              "後で",
              () => snoozeSource({ id: current.id }),
              [current.id],
              current,
            )
          }
          className="min-h-11 rounded-full border border-line text-sm"
        >
          後で
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              confirmHint,
              () =>
                confirmSource({
                  id: current.id,
                  category_id: confirmCategoryId,
                }),
              [current.id],
              current,
            )
          }
          className="min-h-11 rounded-full bg-ink text-paper text-sm"
        >
          確定
        </button>
      </div>
      <p className="mt-3 text-ink-2 text-xs leading-relaxed">
        右スワイプ／確定、左スワイプ／アーカイブ、上スワイプ／後で。カードをタップで開く。PC
        は J/K・1/2/3・E・S・Enter。
      </p>
      {message ? (
        <p className="mt-2 text-ink-2 text-xs" aria-live="polite">
          {message}{" "}
          {retry ? (
            <button
              type="button"
              onClick={retry}
              className="text-accent underline"
            >
              再試行
            </button>
          ) : null}
        </p>
      ) : null}
      {undo ? (
        <div
          className="fixed inset-x-3 z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-full border border-line bg-paper px-4 py-2 shadow-[var(--shadow-card)] bottom-[calc(5.75rem+env(safe-area-inset-bottom))]"
          aria-live="polite"
        >
          <p className="text-sm">{undo.label}しました</p>
          <button
            type="button"
            className="min-h-9 px-2 text-accent text-sm"
            onClick={() => {
              const restored = undo.item;
              setUndo(null);
              setQueue((prev) =>
                prev.some((item) => item.id === restored.id)
                  ? prev
                  : [restored, ...prev],
              );
              startTransition(async () => {
                const result = await restoreSource(undo.snapshot);
                if (!result.ok) {
                  setQueue((prev) =>
                    prev.filter((item) => item.id !== restored.id),
                  );
                  setMessage(result.error.message);
                  return;
                }
                router.refresh();
              });
            }}
          >
            元に戻す
          </button>
        </div>
      ) : null}
    </div>
  );
}
