"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SOURCE_SORTS, type SourceSort } from "@/lib/source-sort";

export function SourceSortSelect({ value }: { value: SourceSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label
      className="notranslate inline-flex items-center gap-1.5 text-ink-2"
      lang="ja"
      translate="no"
    >
      <span>並び</span>
      <select
        value={value}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          const sort = event.target.value;
          if (sort === "posted_desc") {
            next.delete("sort");
          } else {
            next.set("sort", sort);
          }
          const query = next.toString();
          router.push(query ? `${pathname}?${query}` : pathname);
        }}
        className="rounded-full border border-line bg-paper px-2 py-1 text-xs"
      >
        {SOURCE_SORTS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
