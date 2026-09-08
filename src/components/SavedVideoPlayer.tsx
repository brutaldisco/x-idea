"use client";

import { useEffect, useState } from "react";

function RepeatOneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      <path d="M11 10h1v4" />
    </svg>
  );
}

export function SavedVideoPlayer({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const [repeat, setRepeat] = useState(true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4">
      <button
        type="button"
        aria-label="閉じる"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="video-player-shell relative w-full max-w-3xl overflow-hidden rounded-lg border border-line bg-paper">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
          <p className="min-w-0 truncate text-sm">{title}</p>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-pressed={repeat}
              aria-label="1本リピート"
              title="1本リピート"
              onClick={(event) => {
                event.currentTarget.blur();
                setRepeat((value) => !value);
              }}
              className={`inline-flex size-8 items-center justify-center rounded-full outline-none ${
                repeat
                  ? "bg-accent text-paper"
                  : "border border-line text-ink-2 hover:bg-line"
              }`}
            >
              <RepeatOneIcon />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.currentTarget.blur();
                onClose();
              }}
              className="rounded px-2 py-1 text-sm text-ink-2 outline-none hover:bg-line"
            >
              閉じる
            </button>
          </div>
        </div>
        <video
          src={url}
          controls
          autoPlay
          playsInline
          loop={repeat}
          className="max-h-[70vh] w-full bg-ink outline-none"
          onLoadedData={(event) => {
            void event.currentTarget.play().catch(() => undefined);
          }}
        >
          <track kind="captions" />
        </video>
      </div>
    </div>
  );
}
