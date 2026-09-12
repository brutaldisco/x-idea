"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  type PlainMenuOption,
  PlainMenuSelect,
} from "@/components/PlainMenuSelect";
import { SOURCE_KINDS } from "@/lib/source-filters";
import type { TaxonomyAccentId } from "@/lib/taxonomy-accent";
import {
  setReadStatus,
  setSourceKind,
  updateSource,
} from "@/server/actions/sources";
import { infoTypeLabel } from "@/server/ai/info-types";
import { READ_STATUSES } from "@/server/sources/triage";

const READ_LABELS: Record<(typeof READ_STATUSES)[number], string> = {
  unread: "未読",
  read: "読了",
  to_practice: "実践予定",
  practiced: "実践済",
  knowledged: "KC化",
};

type TaxonomyOption = {
  id: string;
  name: string;
  color?: TaxonomyAccentId | null;
};

function withCurrent(
  options: PlainMenuOption[],
  id: string,
  label: string,
  color?: TaxonomyAccentId | null,
): PlainMenuOption[] {
  if (!id || options.some((item) => item.id === id)) {
    return options;
  }
  return [{ id, label, color }, ...options];
}

export function SourceMetaFields({
  id,
  categoryId,
  categoryName,
  infoType,
  readStatus,
  kind,
  categories,
  infoTypes,
}: {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  infoType: string | null;
  readStatus: string;
  kind: string;
  categories: TaxonomyOption[];
  infoTypes: TaxonomyOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [category, setCategory] = useState(categoryId ?? "");
  const [info, setInfo] = useState(infoType ?? "");
  const [read, setRead] = useState(readStatus);
  const [kindValue, setKindValue] = useState(kind);

  useEffect(() => {
    setCategory(categoryId ?? "");
    setInfo(infoType ?? "");
    setRead(readStatus);
    setKindValue(kind);
  }, [categoryId, infoType, readStatus, kind]);

  async function apply(
    next: () => void,
    revert: () => void,
    action: () => Promise<
      { ok: true } | { ok: false; error: { message: string } }
    >,
  ) {
    if (busy) {
      return;
    }
    setBusy(true);
    setMessage(null);
    next();
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      revert();
      setMessage(result.error.message);
      return;
    }
    startTransition(() => router.refresh());
  }

  const categoryOptions = withCurrent(
    categories.map((item) => ({
      id: item.id,
      label: item.name,
      color: item.color,
    })),
    category,
    categoryName ?? category,
    categories.find((item) => item.id === category)?.color,
  );
  const infoOptions = withCurrent(
    infoTypes.map((item) => ({
      id: item.id,
      label: infoTypeLabel(item.id, infoTypes),
      color: item.color,
    })),
    info,
    infoTypeLabel(info, infoTypes),
    infoTypes.find((item) => item.id === info)?.color,
  );
  const kindOptions = withCurrent(
    SOURCE_KINDS.map((item) => ({ id: item.id, label: item.label })),
    kindValue,
    kindValue,
  );

  return (
    <fieldset
      disabled={busy}
      className="notranslate min-w-0"
      lang="ja"
      translate="no"
    >
      <legend className="sr-only">分類と状態</legend>
      <div className="flex flex-wrap justify-end gap-1.5">
        <PlainMenuSelect
          value={category}
          ariaLabel="カテゴリ"
          disabled={busy}
          buttonClassName="max-w-[7rem]"
          options={[{ id: "", label: "Category" }, ...categoryOptions]}
          onChange={(next) => {
            if (next === category) {
              return;
            }
            const prev = category;
            void apply(
              () => setCategory(next),
              () => setCategory(prev),
              () => updateSource({ id, category_id: next || null }),
            );
          }}
        />
        <PlainMenuSelect
          value={info}
          ariaLabel="情報タイプ"
          disabled={busy}
          buttonClassName="max-w-[7rem]"
          options={[{ id: "", label: "Type" }, ...infoOptions]}
          onChange={(next) => {
            if (next === info) {
              return;
            }
            const prev = info;
            void apply(
              () => setInfo(next),
              () => setInfo(prev),
              () => updateSource({ id, info_type: next || null }),
            );
          }}
        />
        <PlainMenuSelect
          value={read}
          ariaLabel="状態"
          disabled={busy}
          buttonClassName="max-w-[7rem]"
          options={READ_STATUSES.map((status) => ({
            id: status,
            label: READ_LABELS[status],
          }))}
          onChange={(next) => {
            if (next === read) {
              return;
            }
            const prev = read;
            void apply(
              () => setRead(next),
              () => setRead(prev),
              () => setReadStatus({ id, status: next }),
            );
          }}
        />
        <PlainMenuSelect
          value={kindValue}
          ariaLabel="種類"
          disabled={busy}
          buttonClassName="max-w-[7rem]"
          options={kindOptions}
          onChange={(next) => {
            if (next === kindValue) {
              return;
            }
            const prev = kindValue;
            void apply(
              () => setKindValue(next),
              () => setKindValue(prev),
              () => setSourceKind({ id, kind: next }),
            );
          }}
        />
      </div>
      {message ? (
        <p className="mt-1 text-right text-ink-2 text-xs" aria-live="polite">
          {message}
        </p>
      ) : null}
    </fieldset>
  );
}
