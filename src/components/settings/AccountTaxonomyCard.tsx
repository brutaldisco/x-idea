"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  invalidateLibraryTaxonomy,
  resetLibraryQueries,
} from "@/lib/library-cache";
import {
  TAXONOMY_ACCENT_CLASSES,
  TAXONOMY_ACCENT_IDS,
  type TaxonomyAccentId,
} from "@/lib/taxonomy-accent";
import { moveTaxonomyItem } from "@/lib/taxonomy-order";
import type {
  AccountTaxonomy,
  TaxonomyItem,
  TaxonomyKind,
} from "@/server/taxonomy";

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
  const queryClient = useQueryClient();
  const [taxonomy, setTaxonomy] = useState<AccountTaxonomy>(
    initial ?? { categories: [], infoTypes: [] },
  );
  const [draft, setDraft] = useState({ category: "", info_type: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmClearBadges, setConfirmClearBadges] = useState(false);

  useEffect(() => {
    if (!confirmClearBadges) {
      return;
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-taxonomy-clear-badges-confirm]")) {
        return;
      }
      setConfirmClearBadges(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setConfirmClearBadges(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [confirmClearBadges]);

  async function request(
    path: string,
    init: RequestInit,
  ): Promise<{
    ok: boolean;
    item?: TaxonomyItem;
    taxonomy?: AccountTaxonomy;
    cleared?: number;
    error?: { message?: string };
  }> {
    const res = await fetch(path, init);
    return (await res.json().catch(() => ({}))) as {
      ok: boolean;
      item?: TaxonomyItem;
      taxonomy?: AccountTaxonomy;
      cleared?: number;
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
    invalidateLibraryTaxonomy(queryClient);
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
        row.id === itemId
          ? { ...row, name: trimmed, color: body.item?.color ?? row.color }
          : row,
      ),
    }));
    invalidateLibraryTaxonomy(queryClient);
    router.refresh();
  }

  async function setColor(
    kind: TaxonomyKind,
    itemId: string,
    color: TaxonomyAccentId,
  ) {
    if (!accountId) {
      return;
    }
    const key = kind === "category" ? "categories" : "infoTypes";
    const previous = taxonomy[key];
    setTaxonomy((prev) => ({
      ...prev,
      [key]: prev[key].map((row) =>
        row.id === itemId ? { ...row, color } : row,
      ),
    }));
    const body = await request("/api/settings/taxonomy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: accountId,
        kind,
        item_id: itemId,
        color,
      }),
    });
    if (!body.ok) {
      setTaxonomy((prev) => ({ ...prev, [key]: previous }));
      setMessage(body.error?.message ?? "色を変えられませんでした");
      return;
    }
    invalidateLibraryTaxonomy(queryClient);
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
    invalidateLibraryTaxonomy(queryClient);
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
        .filter((row): row is TaxonomyItem => Boolean(row)),
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
    invalidateLibraryTaxonomy(queryClient);
    router.refresh();
  }

  async function clearSourceBadges() {
    if (!accountId) {
      return;
    }
    setConfirmClearBadges(false);
    setBusy(true);
    setMessage(null);
    const body = await request("/api/settings/taxonomy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: accountId,
        clear_source_badges: true,
      }),
    });
    setBusy(false);
    if (!body.ok) {
      setMessage(body.error?.message ?? "タグバッジを外せませんでした");
      return;
    }
    const cleared = body.cleared ?? 0;
    setMessage(
      cleared > 0
        ? `${cleared}件の記事からタグバッジを外しました。上の分類一覧はそのままです。`
        : "外すタグバッジはありませんでした。上の分類一覧はそのままです。",
    );
    resetLibraryQueries(queryClient);
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
        分類に使います。左のハンドルで並べ替えできます。いらない項目は 1 件ずつ
        × で消せます。
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
          onColor={(id, color) => void setColor("category", id, color)}
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
          onColor={(id, color) => void setColor("info_type", id, color)}
          onRemove={(id) => void remove("info_type", id)}
          onReorder={(itemIds) => void reorder("info_type", itemIds)}
        />
      </div>
      <div className="mt-6 border-line border-t pt-4">
        <p className="text-sm">記事のタグバッジを外す</p>
        <p className="mt-1 text-ink-2 text-xs leading-relaxed">
          上のカテゴリ／情報タイプの一覧は消えません。消えるのは Library
          や Reader
          の各カードに付いている色つきタグバッジ（記事ごとの割り当て）だけです。あとから記事ごとに付け直せます。
        </p>
        <div className="mt-2">
          {confirmClearBadges ? (
            <output
              data-taxonomy-clear-badges-confirm
              className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-ink text-xs shadow-card"
            >
              各記事のタグバッジをすべて外しますか？ 上の分類一覧は残ります。
              <button
                type="button"
                disabled={busy}
                onClick={() => void clearSourceBadges()}
                className="font-medium text-destructive-fg underline-offset-2 hover:underline disabled:opacity-40"
              >
                する
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearBadges(false)}
                className="text-ink-2 hover:underline"
              >
                やめる
              </button>
            </output>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmClearBadges(true)}
              className="rounded-full border border-line px-3 py-1 text-ink-2 text-xs disabled:opacity-40"
            >
              記事のタグバッジを外す
            </button>
          )}
        </div>
      </div>
      {message ? <p className="mt-3 text-ink-2 text-xs">{message}</p> : null}
    </section>
  );
}

function TaxonomyList({
  accountId,
  title,
  items,
  draft,
  disabled,
  onDraftChange,
  onAdd,
  onRename,
  onColor,
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
  onColor: (id: string, color: TaxonomyAccentId) => void;
  onRemove: (id: string) => void;
  onReorder: (itemIds: string[]) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const overRef = useRef<string | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const canReorder = items.length > 1 && !disabled;

  useEffect(() => {
    if (!confirmId) {
      return;
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-taxonomy-confirm]")) {
        return;
      }
      setConfirmId(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setConfirmId(null);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [confirmId]);

  useEffect(() => {
    if (!draggingId) {
      return;
    }
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    function onMove(event: PointerEvent) {
      event.preventDefault();
      const id = itemIdAtPoint(listRef.current, event.clientY);
      if (id) {
        overRef.current = id;
        setOverId(id);
      }
    }
    function finish(commit: boolean) {
      const sourceId = draggingId;
      const targetId = overRef.current;
      overRef.current = null;
      setDraggingId(null);
      setOverId(null);
      document.body.style.userSelect = previousUserSelect;
      if (commit && sourceId && targetId && sourceId !== targetId) {
        const next = moveTaxonomyItem(items, sourceId, targetId);
        if (next !== items) {
          onReorderRef.current(next.map((row) => row.id));
        }
      }
    }
    function onUp() {
      finish(true);
    }
    function onCancel() {
      finish(false);
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [draggingId, items]);

  function moveByKey(itemId: string, direction: -1 | 1) {
    const index = items.findIndex((row) => row.id === itemId);
    const target = items[index + direction];
    if (!target) {
      return;
    }
    onReorder(moveTaxonomyItem(items, itemId, target.id).map((row) => row.id));
  }

  return (
    <section>
      <h3 className="text-sm">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-ink-2 text-xs">項目はありません</p>
      ) : null}
      <ul
        ref={listRef}
        className={`mt-2 space-y-2 select-none ${draggingId ? "touch-none" : ""}`}
      >
        {items.map((item) => (
          <li
            key={`${accountId}-${item.id}`}
            data-item-id={item.id}
            className={`flex items-center gap-1 ${
              draggingId === item.id
                ? "opacity-60"
                : overId === item.id && draggingId
                  ? "rounded-lg ring-1 ring-ink"
                  : ""
            }`}
          >
            <button
              type="button"
              disabled={!canReorder}
              aria-label={`${item.name}を並べ替え`}
              title="ドラッグ、または矢印キーで並べ替え"
              onPointerDown={(event) => {
                if (!canReorder || event.button !== 0) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                window.getSelection()?.removeAllRanges();
                if (document.activeElement instanceof HTMLElement) {
                  document.activeElement.blur();
                }
                event.currentTarget.setPointerCapture(event.pointerId);
                overRef.current = item.id;
                setConfirmId(null);
                setDraggingId(item.id);
                setOverId(item.id);
              }}
              onTouchStart={(event) => {
                if (!canReorder) {
                  return;
                }
                event.preventDefault();
              }}
              onContextMenu={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                if (!canReorder) {
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  moveByKey(item.id, -1);
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  moveByKey(item.id, 1);
                }
              }}
              className="grid h-11 w-9 shrink-0 cursor-grab touch-none select-none place-items-center text-ink-2 outline-none [-webkit-touch-callout:none] [-webkit-user-select:none] active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
            >
              <GripIcon />
            </button>
            <TaxonomyAccentPicker
              value={item.color}
              disabled={disabled || Boolean(draggingId)}
              ariaLabel={`${item.name}の色`}
              onOpen={() => setConfirmId(null)}
              onChange={(color) => onColor(item.id, color)}
            />
            <input
              defaultValue={item.name}
              disabled={disabled || Boolean(draggingId)}
              maxLength={40}
              aria-label={title}
              onBlur={(event) => onRename(item.id, event.target.value)}
              className={`min-w-0 flex-1 select-none rounded-lg border px-2 py-1.5 text-sm focus:select-text ${
                item.color
                  ? `${TAXONOMY_ACCENT_CLASSES[item.color].bg} ${TAXONOMY_ACCENT_CLASSES[item.color].ink} border-transparent`
                  : "border-line bg-paper"
              } ${draggingId ? "pointer-events-none" : ""}`}
            />
            <div data-taxonomy-confirm className="relative shrink-0">
              <button
                type="button"
                disabled={disabled || items.length <= 1}
                aria-label={`${item.name}を削除`}
                aria-expanded={confirmId === item.id}
                onClick={() =>
                  setConfirmId((current) =>
                    current === item.id ? null : item.id,
                  )
                }
                className="grid h-8 w-8 place-items-center rounded-full border border-line text-ink-2 text-sm leading-none disabled:opacity-40"
              >
                ×
              </button>
              {confirmId === item.id ? (
                <output className="absolute right-0 bottom-full z-40 mb-1 flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-paper px-4 py-2.5 text-ink text-xs shadow-card">
                  削除してよい？
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setConfirmId(null);
                      onRemove(item.id);
                    }}
                    className="font-medium text-destructive-fg underline-offset-2 hover:underline disabled:opacity-40"
                  >
                    する
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="text-ink-2 hover:underline"
                  >
                    やめる
                  </button>
                </output>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onAdd();
        }}
      >
        <input
          value={draft}
          disabled={disabled}
          maxLength={40}
          placeholder="追加"
          aria-label={`${title}を追加`}
          onChange={(event) => onDraftChange(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={disabled || !draft.trim()}
          className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-paper text-xs disabled:opacity-40"
        >
          追加
        </button>
      </form>
    </section>
  );
}

function itemIdAtPoint(
  list: HTMLUListElement | null,
  clientY: number,
): string | null {
  if (!list) {
    return null;
  }
  const rows = [...list.querySelectorAll<HTMLElement>("[data-item-id]")];
  if (rows.length === 0) {
    return null;
  }
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (clientY <= rect.top + rect.height / 2) {
      return row.dataset.itemId ?? null;
    }
  }
  return rows.at(-1)?.dataset.itemId ?? null;
}

function TaxonomyAccentPicker({
  value,
  disabled,
  ariaLabel,
  onOpen,
  onChange,
}: {
  value: TaxonomyAccentId | null;
  disabled: boolean;
  ariaLabel: string;
  onOpen?: () => void;
  onChange: (color: TaxonomyAccentId) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const current = value ? TAXONOMY_ACCENT_CLASSES[value] : null;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative grid h-11 w-8 shrink-0 place-items-center"
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="色"
        onClick={(event) => {
          onOpen?.();
          const rect = event.currentTarget.getBoundingClientRect();
          setCoords({
            top: rect.bottom + 4,
            left: Math.min(rect.left, window.innerWidth - 168),
          });
          setOpen((currentOpen) => !currentOpen);
        }}
        className={`h-8 w-8 leading-none rounded-full border disabled:opacity-40 ${
          current
            ? `${current.bg} ${current.ink} border-transparent`
            : "border-line border-dashed bg-paper"
        }`}
      />
      {open && coords ? (
        <div
          role="listbox"
          aria-label="アクセント色"
          className="fixed z-50 grid grid-cols-3 gap-1.5 rounded-xl border border-line bg-paper p-2 shadow-card"
          style={{ top: coords.top, left: coords.left }}
        >
          {TAXONOMY_ACCENT_IDS.map((id) => {
            const tone = TAXONOMY_ACCENT_CLASSES[id];
            const selected = id === value;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={id}
                onClick={() => {
                  onChange(id);
                  setOpen(false);
                }}
                className={`h-7 w-7 rounded-full ${tone.bg} ${
                  selected
                    ? "ring-2 ring-ink ring-offset-1 ring-offset-paper"
                    : ""
                }`}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function GripIcon() {
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
