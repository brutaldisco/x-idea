"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { moveTaxonomyItem } from "@/lib/taxonomy-order";
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
        分類に使います。左のハンドルで並べ替えできます。
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
  items: { id: string; name: string }[];
  draft: string;
  disabled: boolean;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onReorder: (itemIds: string[]) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const overRef = useRef<string | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const canReorder = items.length > 1 && !disabled;

  useEffect(() => {
    if (!draggingId) {
      return;
    }
    function onMove(event: PointerEvent) {
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
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
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
      <ul ref={listRef} className="mt-2 space-y-2">
        {items.map((item) => (
          <li
            key={`${accountId}-${item.id}`}
            data-item-id={item.id}
            className={`flex gap-2 ${
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
                event.currentTarget.setPointerCapture(event.pointerId);
                overRef.current = item.id;
                setDraggingId(item.id);
                setOverId(item.id);
              }}
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
              className="grid h-9 w-8 shrink-0 cursor-grab place-items-center rounded-lg border border-line bg-paper text-ink-2 active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
            >
              <GripIcon />
            </button>
            <input
              defaultValue={item.name}
              disabled={disabled}
              maxLength={40}
              aria-label={title}
              onBlur={(event) => onRename(item.id, event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              disabled={disabled || items.length <= 1}
              aria-label={`${item.name}を削除`}
              onClick={() => onRemove(item.id)}
              className="shrink-0 rounded-full border border-line px-2 text-ink-2 text-xs disabled:opacity-40"
            >
              削除
            </button>
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
