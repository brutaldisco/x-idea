"use client";

import { usePathname, useRouter } from "next/navigation";
import { PlainMenuSelect } from "@/components/PlainMenuSelect";
import { SOURCE_SORTS, type SourceSort } from "@/lib/source-sort";

export function SourceSortSelect({
  value,
  search,
}: {
  value: SourceSort;
  search: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

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
          const next = new URLSearchParams(search);
          next.delete("page");
          if (sort === "posted_desc") {
            next.delete("sort");
          } else {
            next.set("sort", sort);
          }
          const href = next.toString();
          router.push(href ? `${pathname}?${href}` : pathname);
        }}
      />
    </div>
  );
}
