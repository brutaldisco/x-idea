"use client";

import { type ReactNode, useEffect } from "react";
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
            <IconButton label="前へ" disabled={total < 2} onClick={onPrev}>
              <SkipBackIcon />
            </IconButton>
            <IconButton label="次へ" disabled={total < 2} onClick={onNext}>
              <SkipForwardIcon />
            </IconButton>
          </div>
          <div className="flex flex-wrap gap-1">
            {REPEAT_MODES.map((mode) => {
              const active = repeat === mode.id;
              return (
                <IconButton
                  key={mode.id}
                  label={mode.label}
                  pressed={active}
                  onClick={() => onRepeatChange(mode.id)}
                >
                  {mode.id === "off" ? (
                    <RepeatOffIcon />
                  ) : mode.id === "one" ? (
                    <RepeatOneIcon />
                  ) : (
                    <FolderLoopIcon />
                  )}
                </IconButton>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  label,
  children,
  disabled,
  pressed,
  onClick,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex size-8 items-center justify-center rounded-full disabled:opacity-40 ${
        pressed ? "bg-ink text-paper" : "border border-line hover:bg-paper-2"
      }`}
    >
      {children}
    </button>
  );
}

function PlayerIcon({ children }: { children: ReactNode }) {
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
      {children}
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <PlayerIcon>
      <polygon points="19 20 9 12 19 4 19 20" />
      <line x1="5" x2="5" y1="19" y2="5" />
    </PlayerIcon>
  );
}

function SkipForwardIcon() {
  return (
    <PlayerIcon>
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" x2="19" y1="5" y2="19" />
    </PlayerIcon>
  );
}

function RepeatOffIcon() {
  return (
    <PlayerIcon>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h10" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H7" />
      <path d="M4 4l16 16" />
    </PlayerIcon>
  );
}

function RepeatOneIcon() {
  return (
    <PlayerIcon>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      <path d="M11 10h1v4" />
    </PlayerIcon>
  );
}

function FolderLoopIcon() {
  return (
    <PlayerIcon>
      <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M9 14a3 3 0 1 0 3-3" />
      <path d="M12 11v3h-3" />
    </PlayerIcon>
  );
}
