"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AccountTaxonomy, TaxonomyKind } from "@/server/taxonomy";

export function AccountTaxonomyCard({
  accountId,
  initial,
}: {
  accountId: string | null;
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
  ): Promise<{ ok: boolean; error?: { message?: string } }> {
    const res = await fetch(path, init);
    return (await res.json().catch(() => ({}))) as {
      ok: boolean;
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
      <h3 className="font-semibold">分類</h3>
      <p className="mt-2 text-ink-2 text-sm">
        このアカウントの Library 絞り込みと AI 分類に使います。
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
}) {
  return (
    <section>
      <h3 className="text-sm">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={`${accountId}-${item.id}`} className="flex gap-2">
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
