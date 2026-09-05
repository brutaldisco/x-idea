"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { SourceSortSelect } from "@/components/SourceSortSelect";
import { translatableProps } from "@/lib/chrome-translate";
import { formatCardDate } from "@/lib/datetime";
import type { SourceSort } from "@/lib/source-sort";
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
  const [, startTransition] = useTransition();
  const [queue, setQueue] = useState(items);
  const [message, setMessage] = useState<string | null>(null);
  const [undo, setUndo] = useState<{
    snapshot: SourceSnapshot;
    label: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const current = queue[0] ?? null;
  const remaining = queue.length;

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
    if (current.categoryName) {
      return `${current.categoryName}で確定`;
    }
    if (firstCandidate) {
      return `${firstCandidate.name}で確定`;
    }
    return "カテゴリなしで確定";
  }, [current, firstCandidate]);

  function dismiss(id: string) {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }

  async function run(
    labelText: string,
    fn: () => Promise<
      | { ok: true; data: { id: string; snapshot?: SourceSnapshot } }
      | { ok: false; error: { message: string } }
    >,
  ) {
    if (!current || busy) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    if (result.data.snapshot) {
      setUndo({ snapshot: result.data.snapshot, label: labelText });
    }
    dismiss(current.id);
    startTransition(() => router.refresh());
  }

  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!current || busy) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "Enter") {
        window.location.href = `/source/${current.id}`;
        return;
      }
      if (event.key === "e" || event.key === "E") {
        event.preventDefault();
        void runRef.current("アーカイブ", () => archiveSource(current.id));
        return;
      }
      if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        void runRef.current("後で", () => snoozeSource({ id: current.id }));
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
      if (index >= 0 && index < (current.candidates.length || 0)) {
        event.preventDefault();
        const chip = current.candidates[index];
        void runRef.current(chip.name, () =>
          confirmSource({ id: current.id, category_id: chip.categoryId }),
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, current]);

  if (!current) {
    return (
      <p className="mt-16 text-center text-ink-2">
        {label}の Inbox は空です。ライブラリへどうぞ。
      </p>
    );
  }

  const textAttrs = translatableProps(current.lang, current.summaryFromAi);
  const dateLabel = formatCardDate(current.postedAt);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3 text-ink-2 text-xs">
        <span>
          {label} · 残り{remaining}件
        </span>
        <SourceSortSelect value={sort} />
      </div>
      <div className="mt-2 flex justify-end text-ink-2 text-xs">
        {bulkCount > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void bulkConfirm({ minConfidence: 0.7 }).then((result) => {
                setBusy(false);
                if (!result.ok) {
                  setMessage(result.error.message);
                  return;
                }
                setMessage(
                  `確信度70%以上を${result.data.confirmed}件確定しました`,
                );
                startTransition(() => router.refresh());
              });
            }}
            className="rounded-full border border-line px-3 py-1 text-ink hover:bg-paper-2"
          >
            確信度 ≥ 70% を一括確定（{bulkCount}件）
          </button>
        ) : null}
      </div>

      <article
        className="mt-4 touch-pan-y rounded-[var(--radius-card)] border border-line bg-paper-2 p-4 shadow-[var(--shadow-card)]"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          if (!drag.current) {
            return;
          }
          const next = {
            x: event.clientX - drag.current.x,
            y: event.clientY - drag.current.y,
          };
          offsetRef.current = next;
          setOffset(next);
        }}
        onPointerUp={() => {
          const dx = offsetRef.current.x;
          const dy = offsetRef.current.y;
          drag.current = null;
          offsetRef.current = { x: 0, y: 0 };
          setOffset({ x: 0, y: 0 });
          if (dx > 80) {
            void run(confirmHint, () =>
              confirmSource({
                id: current.id,
                category_id:
                  firstCandidate?.categoryId ?? current.categoryId ?? undefined,
              }),
            );
            return;
          }
          if (dx < -80) {
            void run("アーカイブ", () => archiveSource(current.id));
            return;
          }
          if (dy < -80) {
            void run("後で", () => snoozeSource({ id: current.id }));
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          offsetRef.current = { x: 0, y: 0 };
          setOffset({ x: 0, y: 0 });
        }}
      >
        <div className="flex gap-3">
          {current.mediaId ? (
            <Link
              href={`/source/${current.id}`}
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-paper"
            >
              <Image
                src={thumbSrc(current.mediaId, current.mediaType)}
                alt=""
                width={160}
                height={160}
                unoptimized
                className="h-full w-full object-cover"
              />
            </Link>
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
            <Link
              href={`/source/${current.id}`}
              className="mt-1 line-clamp-4 block text-sm"
              {...textAttrs}
            >
              {current.summary}
            </Link>
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
                  disabled={busy}
                  onClick={() =>
                    void run(chip.name, () =>
                      confirmSource({
                        id: current.id,
                        category_id: chip.categoryId,
                      }),
                    )
                  }
                  className="rounded-full bg-ai-soft px-3 py-1 text-ai text-xs"
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
          <p className="mt-2 text-ink-2 text-xs">{current.tags.join(" · ")}</p>
        ) : null}
      </article>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run("アーカイブ", () => archiveSource(current.id))
          }
          className="rounded-full border border-line py-2 text-sm"
        >
          アーカイブ
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run("後で", () => snoozeSource({ id: current.id }))
          }
          className="rounded-full border border-line py-2 text-sm"
        >
          後で
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(confirmHint, () =>
              confirmSource({
                id: current.id,
                category_id:
                  firstCandidate?.categoryId ?? current.categoryId ?? undefined,
              }),
            )
          }
          className="rounded-full bg-ink py-2 text-paper text-sm"
        >
          確定
        </button>
      </div>
      <p className="mt-3 text-ink-2 text-xs">
        右スワイプ／確定、左スワイプ／アーカイブ、上スワイプ／後で。PC は
        J/K・1/2/3・E・S・Enter。
      </p>
      {message ? (
        <p className="mt-2 text-ink-2 text-xs" aria-live="polite">
          {message}
        </p>
      ) : null}
      {undo ? (
        <div
          className="fixed inset-x-0 bottom-16 z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-full border border-line bg-paper px-4 py-2 shadow-[var(--shadow-card)]"
          aria-live="polite"
        >
          <p className="text-sm">{undo.label}しました</p>
          <button
            type="button"
            onClick={() => {
              void restoreSource(undo.snapshot).then((result) => {
                if (result.ok) {
                  setUndo(null);
                  startTransition(() => router.refresh());
                }
              });
            }}
            className="text-accent text-sm"
          >
            元に戻す
          </button>
        </div>
      ) : null}
    </div>
  );
}
