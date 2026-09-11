"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { LibraryWorkspace } from "@/components/LibraryWorkspace";
import { readLibraryHref } from "@/lib/library-scroll";
import { clampSourcePage } from "@/lib/source-cursor";
import { parseLibraryFilters, parseLibraryView } from "@/lib/source-filters";
import { parseSourceSort } from "@/lib/source-sort";

function searchFromHref(href: string | null): string {
  if (!href) {
    return "";
  }
  const q = href.indexOf("?");
  return q >= 0 ? href.slice(q + 1) : "";
}

export function LibraryClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSearch = useRef(searchParams.toString());
  if (pathname.startsWith("/library")) {
    lastSearch.current = searchParams.toString();
  } else if (!lastSearch.current) {
    lastSearch.current = searchFromHref(readLibraryHref());
  }
  const search = pathname.startsWith("/source/")
    ? lastSearch.current
    : searchParams.toString();
  const params = new URLSearchParams(search);
  return (
    <LibraryWorkspace
      sort={parseSourceSort(params.get("sort"))}
      view={parseLibraryView(params.get("view"))}
      filters={parseLibraryFilters(params)}
      page={clampSourcePage(params.get("page"))}
      search={search}
    />
  );
}
