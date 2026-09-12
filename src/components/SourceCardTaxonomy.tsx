"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type PlainMenuOption,
  PlainMenuSelect,
} from "@/components/PlainMenuSelect";
import {
  LIBRARY_SOURCES_KEY,
  patchSourceInLibraryQueries,
} from "@/lib/library-cache";
import type { TaxonomyChipItem } from "@/lib/taxonomy-chip";
import { updateSource } from "@/server/actions/sources";
import { infoTypeLabel } from "@/server/ai/info-types";

function withCurrent(
  options: PlainMenuOption[],
  id: string,
  label: string,
  color?: string | null,
): PlainMenuOption[] {
  if (!id || options.some((item) => item.id === id)) {
    return options;
  }
  return [{ id, label, color }, ...options];
}

export function SourceCardTaxonomy({
  sourceId,
  categoryId,
  infoType,
  categories,
  infoTypes,
}: {
  sourceId: string;
  categoryId?: string | null;
  infoType?: string | null;
  categories: TaxonomyChipItem[];
  infoTypes: TaxonomyChipItem[];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState(categoryId ?? "");
  const [info, setInfo] = useState(infoType ?? "");

  useEffect(() => {
    setCategory(categoryId ?? "");
    setInfo(infoType ?? "");
  }, [categoryId, infoType]);

  async function apply(
    next: () => void,
    revert: () => void,
    patch: { categoryId?: string | null; infoType?: string | null },
    action: () => Promise<
      { ok: true } | { ok: false; error: { message: string } }
    >,
  ) {
    if (busy) {
      return;
    }
    setBusy(true);
    next();
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      revert();
      return;
    }
    patchSourceInLibraryQueries(queryClient, sourceId, patch);
    void queryClient.invalidateQueries({ queryKey: [LIBRARY_SOURCES_KEY] });
    router.refresh();
  }

  const categoryOptions = withCurrent(
    categories.map((item) => ({
      id: item.id,
      label: item.name,
      color: item.color,
    })),
    category,
    categories.find((item) => item.id === category)?.name ?? category,
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

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
      <PlainMenuSelect
        variant="badge"
        value={category}
        ariaLabel="カテゴリ"
        disabled={busy}
        options={[{ id: "", label: "Category" }, ...categoryOptions]}
        onChange={(next) => {
          if (next === category) {
            return;
          }
          const prev = category;
          void apply(
            () => setCategory(next),
            () => setCategory(prev),
            { categoryId: next || null },
            () => updateSource({ id: sourceId, category_id: next || null }),
          );
        }}
      />
      <PlainMenuSelect
        variant="badge"
        value={info}
        ariaLabel="情報タイプ"
        disabled={busy}
        options={[{ id: "", label: "Type" }, ...infoOptions]}
        onChange={(next) => {
          if (next === info) {
            return;
          }
          const prev = info;
          void apply(
            () => setInfo(next),
            () => setInfo(prev),
            { infoType: next || null },
            () => updateSource({ id: sourceId, info_type: next || null }),
          );
        }}
      />
    </div>
  );
}
