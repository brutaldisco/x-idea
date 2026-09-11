"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  LIBRARY_SOURCES_KEY,
  removeSourceFromLibraryQueries,
} from "@/lib/library-cache";
import { rememberDeletedSource } from "@/lib/library-deleted";
import { readLibraryHref } from "@/lib/library-scroll";

export function SourceCardMenu({
  sourceId,
  url,
  compact = false,
  canQueueVideos = false,
}: {
  sourceId: string;
  url: string | null;
  compact?: boolean;
  canQueueVideos?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queueBusy, setQueueBusy] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  async function onQueueVideos() {
    setQueueBusy(true);
    try {
      const res = await fetch("/api/videos/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: sourceId }),
      });
      const body = (await res.json().catch(() => null)) as {
        message?: string;
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        window.alert(body?.error?.message ?? "キューに追加できませんでした。");
        return;
      }
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: [LIBRARY_SOURCES_KEY] });
      if (!pathname.startsWith("/library")) {
        router.refresh();
      }
      window.alert(body?.message ?? "キューに追加しました。");
    } finally {
      setQueueBusy(false);
    }
  }

  async function onDelete() {
    if (
      !window.confirm(
        "この投稿と保存した画像を削除しますか？同期では戻りません。権限があれば X のブックマークからも外します。手元にダウンロードした動画ファイルは残り、Finder で手動削除してください。",
      )
    ) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/sources/${sourceId}`, { method: "DELETE" });
      if (!res.ok) {
        window.alert("削除できませんでした。");
        return;
      }
      setOpen(false);
      rememberDeletedSource(sourceId);
      removeSourceFromLibraryQueries(queryClient, sourceId);
      void queryClient.invalidateQueries({ queryKey: [LIBRARY_SOURCES_KEY] });
      if (pathname.startsWith("/source/")) {
        router.push(readLibraryHref() ?? "/library", { scroll: false });
        return;
      }
      if (!pathname.startsWith("/library")) {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative notranslate"
      lang="ja"
      translate="no"
    >
      <button
        type="button"
        aria-label="操作"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={busy || queueBusy}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          setCoords({
            top: rect.bottom + 4,
            right: window.innerWidth - rect.right,
          });
          setOpen((value) => !value);
        }}
        className={`flex items-center justify-center rounded-full text-ink-2 hover:bg-paper ${
          compact ? "h-5 w-5" : "h-7 w-7"
        }`}
      >
        <span aria-hidden className="text-base leading-none">
          ⋮
        </span>
      </button>
      {open && coords ? (
        <div
          id={panelId}
          role="menu"
          className="fixed z-50 min-w-44 rounded-xl border border-line bg-paper/95 py-1 shadow-card backdrop-blur"
          style={{ top: coords.top, right: coords.right }}
        >
          {canQueueVideos ? (
            <button
              type="button"
              role="menuitem"
              disabled={queueBusy}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void onQueueVideos();
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-paper-2"
            >
              {queueBusy ? "追加中…" : "動画を保存する"}
            </button>
          ) : null}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              className="block px-3 py-2 text-sm hover:bg-paper-2"
              onClick={() => setOpen(false)}
            >
              X で開く
            </a>
          ) : null}
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => void onDelete()}
            className="block w-full px-3 py-2 text-left text-danger text-sm hover:bg-paper-2"
          >
            {busy ? "削除中…" : "削除"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
