"use client";

import { useEffect } from "react";
import {
  parseRepeatMode,
  REPEAT_MODES,
  type RepeatMode,
} from "@/lib/video-playlist";

const STORAGE_KEY = "x-idea-video-repeat";

export function loadRepeatMode(): RepeatMode {
  if (typeof window === "undefined") {
    return "folder";
  }
  return parseRepeatMode(window.localStorage.getItem(STORAGE_KEY));
}

export function saveRepeatMode(mode: RepeatMode): void {
  window.localStorage.setItem(STORAGE_KEY, mode);
}

export function VideoPlayer({
  url,
  title,
  folderLabel,
  index,
  total,
  repeat,
  onRepeatChange,
  onClose,
  onPrev,
  onNext,
  onEnded,
}: {
  url: string;
  title: string;
  folderLabel: string;
  index: number;
  total: number;
  repeat: RepeatMode;
  onRepeatChange: (mode: RepeatMode) => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onEnded: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
      if (event.key === "ArrowRight") {
        onNext();
      }
      if (event.key === "ArrowLeft") {
        onPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onPrev]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 min-[48rem]:p-10">
      <div className="w-full max-w-4xl rounded-2xl bg-paper p-3">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm">{title}</p>
            <p className="text-ink-2 text-xs">
              {folderLabel}
              {total > 0 ? ` · ${index + 1} / ${total}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full px-3 py-1 text-sm hover:bg-paper-2"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>
        <video
          key={url}
          controls
          autoPlay
          playsInline
          loop={repeat === "one"}
          src={url}
          className="max-h-[70vh] w-full bg-ink"
          onLoadedData={(event) => {
            void event.currentTarget.play().catch(() => undefined);
          }}
          onEnded={() => {
            if (repeat === "one") {
              return;
            }
            onEnded();
          }}
        >
          <track kind="captions" />
        </video>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-line px-3 py-1 text-xs hover:bg-paper-2 disabled:opacity-40"
              disabled={total < 2}
              onClick={onPrev}
            >
              前へ
            </button>
            <button
              type="button"
              className="rounded-full border border-line px-3 py-1 text-xs hover:bg-paper-2 disabled:opacity-40"
              disabled={total < 2}
              onClick={onNext}
            >
              次へ
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {REPEAT_MODES.map((mode) => {
              const active = repeat === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onRepeatChange(mode.id)}
                  className={`rounded-full px-3 py-1 text-xs ${
                    active
                      ? "bg-ink text-paper"
                      : "border border-line hover:bg-paper-2"
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
