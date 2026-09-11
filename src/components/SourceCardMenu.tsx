"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LIBRARY_SOURCES_KEY,
  removeSourceFromLibraryQueries,
} from "@/lib/library-cache";
import { rememberDeletedSource } from "@/lib/library-deleted";
import { readLibraryHref } from "@/lib/library-scroll";

const MENU_WIDTH = 176;
const MENU_HEIGHT = 140;

function menuCoords(rect: DOMRect): { top: number; left: number } {
  const left = Math.min(
    Math.max(8, rect.right - MENU_WIDTH),
    window.innerWidth - MENU_WIDTH - 8,
  );
  const below = rect.bottom + 4;
  const top =
    below + MENU_HEIGHT > window.innerHeight - 8 &&
    rect.top - MENU_HEIGHT - 4 > 8
      ? rect.top - MENU_HEIGHT - 4
      : below;
  return { top, left };
}

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
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queueBusy, setQueueBusy] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const onClose = () => {
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
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
      if (pathname.startsWith("/library")) {
        router.push("/videos?queue=1");
        return;
      }
      router.refresh();
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
          setCoords(menuCoords(rect));
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
      {mounted && open && coords
        ? createPortal(
            <div
              ref={menuRef}
              id={panelId}
              role="menu"
              className="fixed z-50 min-w-44 rounded-xl border border-line bg-paper/95 py-1 shadow-card"
              style={{ top: coords.top, left: coords.left }}
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
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
