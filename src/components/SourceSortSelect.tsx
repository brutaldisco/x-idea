"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PlainMenuSelect } from "@/components/PlainMenuSelect";
import { SOURCE_SORTS, type SourceSort } from "@/lib/source-sort";

export function SourceSortSelect({ value }: { value: SourceSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div
      className="notranslate inline-flex items-center gap-1.5 text-ink-2"
      lang="ja"
      translate="no"
    >
      <span>並び</span>
      <PlainMenuSelect
        value={value}
        ariaLabel="並び"
        options={SOURCE_SORTS.map((item) => ({
          id: item.id,
          label: item.label,
        }))}
        onChange={(sort) => {
          const next = new URLSearchParams(searchParams.toString());
          if (sort === "posted_desc") {
            next.delete("sort");
          } else {
            next.set("sort", sort);
          }
          const query = next.toString();
          router.push(query ? `${pathname}?${query}` : pathname);
        }}
      />
    </div>
  );
}
