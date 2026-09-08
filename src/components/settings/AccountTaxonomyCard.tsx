"use client";

import { useRouter } from "next/navigation";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  dragTargetIndex,
  moveTaxonomyItem,
  moveTaxonomyItemToIndex,
} from "@/lib/taxonomy-order";
import type { AccountTaxonomy, TaxonomyKind } from "@/server/taxonomy";

export function AccountTaxonomyCard({
  accountId,
  accountUsername,
  initial,
}: {
  accountId: string | null;
  accountUsername: string | null;
  initial: AccountTaxonomy | null;
}) {
  const router = useRouter();
  const [taxonomy, setTaxonomy] = useState<AccountTaxonomy>(
    initial ?? { categories: [], infoTypes: [] },
  );
  const [draft, setDraft] = useState({ category: "", info_type: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function request(
    path: string,
    init: RequestInit,
  ): Promise<{
    ok: boolean;
    taxonomy?: AccountTaxonomy;
    error?: { message?: string };
  }> {
    const res = await fetch(path, init);
    return (await res.json().catch(() => ({}))) as {
      ok: boolean;
      taxonomy?: AccountTaxonomy;
      error?: { message?: string };
    };
  }

  async function add(kind: TaxonomyKind) {
    const name = draft[kind].trim();
    if (!name || !accountId) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const body = await request("/api/settings/taxonomy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId, kind, name }),
    });
    setBusy(false);
    if (!body.ok) {
      setMessage(body.error?.message ?? "追加できませんでした");
      return;
    }
    setDraft((current) => ({ ...current, [kind]: "" }));
    router.refresh();
    const next = await fetch(
      `/api/settings/taxonomy?account_id=${encodeURIComponent(accountId)}`,
      { cache: "no-store" },
    )
      .then((res) => res.json() as Promise<{ taxonomy?: AccountTaxonomy }>)
      .catch(() => null);
    if (next?.taxonomy) {
      setTaxonomy(next.taxonomy);
    }
  }

  async function rename(kind: TaxonomyKind, itemId: string, name: string) {
    const trimmed = name.trim();
    const current =
      kind === "category"
        ? taxonomy.categories.find((row) => row.id === itemId)
        : taxonomy.infoTypes.find((row) => row.id === itemId);
    if (!current || current.name === trimmed || !trimmed || !accountId) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const body = await request("/api/settings/taxonomy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: accountId,
        kind,
        item_id: itemId,
        name: trimmed,
      }),
    });
    setBusy(false);
    if (!body.ok) {
      setMessage(body.error?.message ?? "変更できませんでした");
      return;
    }
    const key = kind === "category" ? "categories" : "infoTypes";
    setTaxonomy((prev) => ({
      ...prev,
      [key]: prev[key].map((row) =>
        row.id === itemId ? { ...row, name: trimmed } : row,
      ),
    }));
    router.refresh();
  }

  async function remove(kind: TaxonomyKind, itemId: string) {
    if (!accountId) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const params = new URLSearchParams({
      account_id: accountId,
      kind,
      item_id: itemId,
    });
    const body = await request(`/api/settings/taxonomy?${params}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!body.ok) {
      setMessage(body.error?.message ?? "削除できませんでした");
      return;
    }
    const key = kind === "category" ? "categories" : "infoTypes";
    setTaxonomy((prev) => ({
      ...prev,
      [key]: prev[key].filter((row) => row.id !== itemId),
    }));
    router.refresh();
  }

  async function reorder(kind: TaxonomyKind, itemIds: string[]) {
    if (!accountId) {
      return;
    }
    const key = kind === "category" ? "categories" : "infoTypes";
    const previous = taxonomy[key];
    setTaxonomy((prev) => ({
      ...prev,
      [key]: itemIds
        .map((id) => prev[key].find((row) => row.id === id))
        .filter((row): row is { id: string; name: string } => Boolean(row)),
    }));
    setBusy(true);
    setMessage(null);
    const body = await request("/api/settings/taxonomy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: accountId,
        kind,
        item_ids: itemIds,
      }),
    });
    setBusy(false);
    if (!body.ok) {
      setTaxonomy((prev) => ({ ...prev, [key]: previous }));
      setMessage(body.error?.message ?? "並べ替えできませんでした");
      return;
    }
    if (body.taxonomy) {
      setTaxonomy(body.taxonomy);
    }
    router.refresh();
  }

  if (!accountId) {
    return (
      <section>
        <h3 className="font-semibold">分類</h3>
        <p className="mt-2 text-ink-2 text-sm">
          X 連携後に、カテゴリと情報タイプを編集できます。
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">分類</h3>
        {accountUsername ? (
          <span className="rounded-full bg-paper px-2 py-0.5 text-ink-2 text-xs">
            @{accountUsername}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-ink-2 text-sm">
        @{accountUsername ?? "このアカウント"} の Library 絞り込みと AI
        分類に使います。左のハンドルを押したまま上下に動かすと、項目が指について入れ替わります。
      </p>
      <div className="mt-4 grid gap-4 min-[48rem]:grid-cols-2">
        <TaxonomyList
          accountId={accountId}
          title="カテゴリ"
          items={taxonomy.categories}
          draft={draft.category}
          disabled={busy}
          onDraftChange={(value) =>
            setDraft((current) => ({ ...current, category: value }))
          }
          onAdd={() => void add("category")}
          onRename={(id, name) => void rename("category", id, name)}
          onRemove={(id) => void remove("category", id)}
          onReorder={(itemIds) => void reorder("category", itemIds)}
        />
        <TaxonomyList
          accountId={accountId}
          title="情報タイプ"
          items={taxonomy.infoTypes}
          draft={draft.info_type}
          disabled={busy}
          onDraftChange={(value) =>
            setDraft((current) => ({ ...current, info_type: value }))
          }
          onAdd={() => void add("info_type")}
          onRename={(id, name) => void rename("info_type", id, name)}
          onRemove={(id) => void remove("info_type", id)}
          onReorder={(itemIds) => void reorder("info_type", itemIds)}
        />
      </div>
      {message ? <p className="mt-3 text-ink-2 text-xs">{message}</p> : null}
    </section>
  );
}

type TaxonomyItem = { id: string; name: string };

const PREVIEW_LIFT_PX = 40;

type DragSession = {
  id: string;
  pointerId: number;
  startItems: TaxonomyItem[];
  grabOffsetY: number;
  listLeft: number;
  listWidth: number;
  rowHeight: number;
  initialTop: number;
};

function TaxonomyList({
  accountId,
  title,
  items,
  draft,
  disabled,
  onDraftChange,
  onAdd,
  onRename,
  onRemove,
  onReorder,
}: {
  accountId: string;
  title: string;
  items: TaxonomyItem[];
  draft: string;
  disabled: boolean;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onReorder: (itemIds: string[]) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const previewRef = useRef<HTMLDivElement>(null);
  const lastYRef = useRef<number | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const itemsRef = useRef(items);
  const onReorderRef = useRef(onReorder);
  const [ordered, setOrdered] = useState(items);
  const [drag, setDrag] = useState<DragSession | null>(null);
  const [mounted, setMounted] = useState(false);
  const draggingId = drag?.id ?? null;
  onReorderRef.current = onReorder;
  itemsRef.current = ordered;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!draggingId) {
      setOrdered(items);
    }
  }, [items, draggingId]);

  useEffect(() => {
    if (!drag) {
      return;
    }
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    function applyPreviewTop(clientY: number) {
      const session = dragRef.current;
      const node = previewRef.current;
      if (!session || !node) {
        return;
      }
      node.style.top = `${clientY - session.grabOffsetY - PREVIEW_LIFT_PX}px`;
    }

    function onMove(event: PointerEvent) {
      const session = dragRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }
      event.preventDefault();
      lastYRef.current = event.clientY;
      applyPreviewTop(event.clientY);
      const remaining = itemsRef.current.filter(
        (item) => item.id !== session.id,
      );
      const mids = remaining.map((item) => {
        const el = rowRefs.current.get(item.id);
        if (!el) {
          return Number.POSITIVE_INFINITY;
        }
        const rect = el.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      const target = dragTargetIndex(event.clientY, mids);
      const current = itemsRef.current.findIndex(
        (row) => row.id === session.id,
      );
      if (target === current || current < 0) {
        return;
      }
      const next = moveTaxonomyItemToIndex(
        itemsRef.current,
        session.id,
        target,
      );
      if (next === itemsRef.current) {
        return;
      }
      itemsRef.current = next;
      setOrdered(next);
      vibrate(8);
    }

    function finish(commit: boolean) {
      const session = dragRef.current;
      dragRef.current = null;
      lastYRef.current = null;
      setDrag(null);
      document.body.style.userSelect = previousUserSelect;
      if (!session) {
        return;
      }
      const nextIds = itemsRef.current.map((row) => row.id);
      const unchanged = session.startItems.every(
        (row, index) => row.id === nextIds[index],
      );
      if (!commit || unchanged) {
        itemsRef.current = session.startItems;
        setOrdered(session.startItems);
        return;
      }
      onReorderRef.current(nextIds);
    }

    function onUp(event: PointerEvent) {
      if (event.pointerId !== drag.pointerId) {
        return;
      }
      finish(true);
    }
    function onCancel(event: PointerEvent) {
      if (event.pointerId !== drag.pointerId) {
        return;
      }
      finish(false);
    }

    function preventTouchScroll(event: TouchEvent) {
      event.preventDefault();
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("touchmove", preventTouchScroll, {
      passive: false,
    });
    return () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("touchmove", preventTouchScroll);
    };
  }, [drag]);

  function beginDrag(
    item: TaxonomyItem,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (ordered.length <= 1 || disabled || event.button !== 0) {
      return;
    }
    const row = rowRefs.current.get(item.id);
    const list = listRef.current;
    if (!row || !list) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const rowRect = row.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const session: DragSession = {
      id: item.id,
      pointerId: event.pointerId,
      startItems: ordered,
      grabOffsetY: event.clientY - rowRect.top,
      listLeft: listRect.left,
      listWidth: listRect.width,
      rowHeight: rowRect.height,
      initialTop: rowRect.top,
    };
    lastYRef.current = event.clientY;
    dragRef.current = session;
    setDrag(session);
    vibrate(12);
  }

  function moveByKey(itemId: string, direction: -1 | 1) {
    const index = ordered.findIndex((row) => row.id === itemId);
    const target = ordered[index + direction];
    if (!target) {
      return;
    }
    onReorder(
      moveTaxonomyItem(ordered, itemId, target.id).map((row) => row.id),
    );
  }

  const draggingItem = ordered.find((row) => row.id === draggingId) ?? null;

  return (
    <section>
      <h3 className="text-sm">{title}</h3>
      <ul
        ref={listRef}
        className={`mt-2 space-y-2 select-none ${draggingId ? "touch-none overscroll-none" : ""}`}
      >
        {ordered.map((item) => {
          const isSource = draggingId === item.id;
          return (
            <li
              key={`${accountId}-${item.id}`}
              ref={(node) => {
                if (node) {
                  rowRefs.current.set(item.id, node);
                } else {
                  rowRefs.current.delete(item.id);
                }
              }}
              data-item-id={item.id}
              className="relative"
              style={isSource ? { height: drag?.rowHeight } : undefined}
            >
              <div className={isSource ? "invisible" : undefined}>
                <TaxonomyRow
                  item={item}
                  title={title}
                  canReorder={ordered.length > 1 && !disabled}
                  disabled={disabled || Boolean(draggingId)}
                  canRemove={ordered.length > 1 && !disabled && !draggingId}
                  onPointerDown={(event) => beginDrag(item, event)}
                  onRename={onRename}
                  onRemove={onRemove}
                  onMoveByKey={moveByKey}
                />
              </div>
              {isSource ? (
                <div
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-ink bg-marker/70"
                >
                  <span className="text-ink text-xs">ここに置く</span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {draggingId ? (
        <p
          className="mt-2 rounded-lg bg-marker px-3 py-1.5 text-center text-ink text-xs"
          aria-live="polite"
        >
          移動中 · 指を離すと保存
        </p>
      ) : null}
      {mounted && drag && draggingItem
        ? createPortal(
            <div
              ref={previewRef}
              className="pointer-events-none fixed z-50"
              style={{
                left: drag.listLeft,
                width: drag.listWidth,
                top:
                  lastYRef.current == null
                    ? drag.initialTop - PREVIEW_LIFT_PX
                    : lastYRef.current - drag.grabOffsetY - PREVIEW_LIFT_PX,
                transform: "scale(1.04)",
              }}
            >
              <div className="rounded-[var(--radius-card)] border-2 border-ink bg-paper shadow-[var(--shadow-card)]">
                <p className="rounded-t-[calc(var(--radius-card)-2px)] bg-marker px-3 py-1 text-center text-ink text-xs">
                  移動中 · 指を離すと保存
                </p>
                <div className="px-1 pb-1 pt-1">
                  <TaxonomyRow
                    item={draggingItem}
                    title={title}
                    canReorder
                    disabled
                    canRemove={false}
                    preview
                    onPointerDown={() => undefined}
                    onRename={() => undefined}
                    onRemove={() => undefined}
                    onMoveByKey={() => undefined}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd();
        }}
      >
        <input
          value={draft}
          disabled={disabled || Boolean(draggingId)}
          maxLength={40}
          placeholder="追加"
          aria-label={`${title}を追加`}
          onChange={(event) => onDraftChange(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={disabled || Boolean(draggingId) || !draft.trim()}
          className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-paper text-xs disabled:opacity-40"
        >
          追加
        </button>
      </form>
    </section>
  );
}

function TaxonomyRow({
  item,
  title,
  canReorder,
  disabled,
  canRemove,
  preview = false,
  onPointerDown,
  onRename,
  onRemove,
  onMoveByKey,
}: {
  item: TaxonomyItem;
  title: string;
  canReorder: boolean;
  disabled: boolean;
  canRemove: boolean;
  preview?: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onMoveByKey: (itemId: string, direction: -1 | 1) => void;
}) {
  const handleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const node = handleRef.current;
    if (!node || preview || !canReorder) {
      return;
    }
    function onTouchStart(event: TouchEvent) {
      event.preventDefault();
    }
    node.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => node.removeEventListener("touchstart", onTouchStart);
  }, [canReorder, preview]);

  return (
    <div className="flex items-center gap-1">
      <button
        ref={handleRef}
        type="button"
        disabled={!canReorder}
        tabIndex={preview ? -1 : 0}
        aria-hidden={preview}
        aria-label={preview ? undefined : `${item.name}を並べ替え`}
        title={preview ? undefined : "ドラッグ、または矢印キーで並べ替え"}
        onPointerDown={preview ? undefined : onPointerDown}
        onContextMenu={preview ? undefined : (event) => event.preventDefault()}
        onKeyDown={
          preview || !canReorder
            ? undefined
            : (event) => {
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  onMoveByKey(item.id, -1);
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  onMoveByKey(item.id, 1);
                }
              }
        }
        className="grid h-11 w-9 shrink-0 cursor-grab touch-none select-none place-items-center text-ink-2 outline-none [-webkit-touch-callout:none] [-webkit-user-select:none] active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
      >
        <TaxonomyGripIcon />
      </button>
      {preview ? (
        <span className="min-w-0 flex-1 truncate rounded-lg border border-line bg-paper px-2 py-1.5 text-sm">
          {item.name}
        </span>
      ) : (
        <input
          defaultValue={item.name}
          disabled={disabled}
          maxLength={40}
          aria-label={title}
          onBlur={(event) => onRename(item.id, event.target.value)}
          className={`min-w-0 flex-1 select-none rounded-lg border border-line bg-paper px-2 py-1.5 text-sm focus:select-text ${
            disabled ? "pointer-events-none" : ""
          }`}
        />
      )}
      <button
        type="button"
        tabIndex={preview ? -1 : 0}
        disabled={!canRemove}
        aria-hidden={preview}
        aria-label={preview ? undefined : `${item.name}を削除`}
        onClick={preview ? undefined : () => onRemove(item.id)}
        className="shrink-0 rounded-full border border-line px-2 text-ink-2 text-xs disabled:opacity-40"
      >
        削除
      </button>
    </div>
  );
}

function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Some browsers expose vibrate but reject it.
  }
}

function TaxonomyGripIcon() {
  return (
    <span aria-hidden className="grid grid-cols-2 gap-0.5">
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
    </span>
  );
}
