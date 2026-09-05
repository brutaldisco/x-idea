"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

export function SourceCardMenu({
  sourceId,
  url,
}: {
  sourceId: string;
  url: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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

  async function onDelete() {
    if (
      !window.confirm(
        "この投稿と保存した画像・動画を削除しますか？元に戻せません。",
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
      if (pathname.startsWith("/source/")) {
        router.push("/library");
        router.refresh();
        return;
      }
      router.refresh();
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
        disabled={busy}
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
        className="flex h-7 w-7 items-center justify-center rounded-full text-ink-2 hover:bg-paper"
      >
        <span aria-hidden className="text-base leading-none">
          ⋮
        </span>
      </button>
      {open && coords ? (
        <div
          id={panelId}
          role="menu"
          className="fixed z-50 min-w-36 rounded-xl border border-line bg-paper/95 py-1 shadow-card backdrop-blur"
          style={{ top: coords.top, right: coords.right }}
        >
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
