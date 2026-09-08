"use client";

import { useSearchParams } from "next/navigation";
import { LibraryWorkspace } from "@/components/LibraryWorkspace";
import { parseLibraryFilters, parseLibraryView } from "@/lib/source-filters";
import { parseSourceSort } from "@/lib/source-sort";

export function LibraryClient() {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  return (
    <LibraryWorkspace
      sort={parseSourceSort(searchParams.get("sort"))}
      view={parseLibraryView(searchParams.get("view"))}
      filters={parseLibraryFilters(searchParams)}
      search={search}
    />
  );
}
