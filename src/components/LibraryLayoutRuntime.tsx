"use client";

import { useEffect } from "react";
import { applyLibraryWide, readLibraryWide } from "@/lib/library-layout";

export function LibraryLayoutRuntime() {
  useEffect(() => {
    applyLibraryWide(readLibraryWide());
  }, []);

  return null;
}
