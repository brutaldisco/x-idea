"use client";

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { mediaVideoProxyFallbackPath } from "@/lib/media-video-api";
import {
  exitFullscreen,
  getFullscreenElement,
  isFullscreen,
  requestFullscreen,
  subscribeFullscreen,
} from "@/lib/video-fullscreen";
import {
  parseRepeatMode,
  REPEAT_TOGGLE_MODES,
  type RepeatMode,
  toggleRepeatMode,
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
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shellFullscreen, setShellFullscreen] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState(url);

  useEffect(() => {
    setPlaybackUrl(url);
  }, [url]);

  useLayoutEffect(() => {
    const el = videoRef.current;
    if (!el) {
      return;
    }
    el.setAttribute("referrerpolicy", "no-referrer");
    if (el.getAttribute("src") !== playbackUrl) {
      el.src = playbackUrl;
    }
  }, [playbackUrl]);

  useEffect(() => {
    function sync() {
      const shell = shellRef.current;
      const video = videoRef.current;
      setShellFullscreen(Boolean(shell && getFullscreenElement() === shell));
      if (shell && video && getFullscreenElement() === video) {
        void exitFullscreen()
          .then(() => requestFullscreen(shell))
          .catch(() => undefined);
      }
    }
    sync();
    return subscribeFullscreen(sync);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest("input, textarea, select") || target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "Escape") {
        if (isFullscreen()) {
          return;
        }
        onClose();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        onNext();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        onPrev();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, onNext, onPrev]);

  async function toggleFullscreen() {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    if (getFullscreenElement() === shell) {
      await exitFullscreen().catch(() => undefined);
      return;
    }
    await requestFullscreen(shell).catch(() => undefined);
  }

  return (
    <div
      ref={shellRef}
      className="video-player-shell fixed inset-0 z-50 flex flex-col bg-black text-white [color-scheme:dark]"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-neutral-600">{title}</p>
          <p className="text-neutral-600 text-xs">
            {folderLabel}
            {total > 0 ? ` · ${index + 1} / ${total}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            label={shellFullscreen ? "全画面を終了" : "全画面"}
            pressed={shellFullscreen}
            onClick={() => void toggleFullscreen()}
          >
            {shellFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </IconButton>
          <IconButton label="閉じる" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>
      </div>
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        controlsList="nofullscreen"
        loop={repeat === "one"}
        className="min-h-0 w-full flex-1 bg-black object-contain outline-none"
        onError={() => {
          const fallback = mediaVideoProxyFallbackPath(playbackUrl);
          if (fallback) {
            setPlaybackUrl(fallback);
          }
        }}
        onDoubleClick={() => void toggleFullscreen()}
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
      <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex flex-wrap gap-2">
          <IconButton label="前へ" disabled={total < 2} onClick={onPrev}>
            <SkipBackIcon />
          </IconButton>
          <IconButton label="次へ" disabled={total < 2} onClick={onNext}>
            <SkipForwardIcon />
          </IconButton>
        </div>
        <div className="flex flex-wrap gap-1">
          {REPEAT_TOGGLE_MODES.map((mode, index) => {
            const active = repeat === mode.id;
            return (
              <IconButton
                key={mode.id}
                label={mode.label}
                tip
                soft
                tipAlign={
                  index === REPEAT_TOGGLE_MODES.length - 1 ? "end" : "center"
                }
                pressed={active}
                onClick={() =>
                  onRepeatChange(toggleRepeatMode(repeat, mode.id))
                }
              >
                {mode.id === "one" ? <RepeatOneIcon /> : <FolderLoopIcon />}
              </IconButton>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const TIP_SHOW_MS = 150;

function IconButton({
  label,
  children,
  disabled,
  pressed,
  tip,
  tipAlign = "center",
  soft,
  onClick,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  tip?: boolean;
  tipAlign?: "center" | "end";
  soft?: boolean;
  onClick: () => void;
}) {
  const [showTip, setShowTip] = useState(false);
  const tipTimer = useRef<number | null>(null);
  const hovered = useRef(false);

  function clearTipTimer() {
    if (tipTimer.current != null) {
      window.clearTimeout(tipTimer.current);
      tipTimer.current = null;
    }
  }

  function openTip() {
    clearTipTimer();
    tipTimer.current = window.setTimeout(() => {
      setShowTip(true);
    }, TIP_SHOW_MS);
  }

  function closeTip() {
    clearTipTimer();
    setShowTip(false);
  }

  useEffect(() => {
    return () => {
      if (tipTimer.current != null) {
        window.clearTimeout(tipTimer.current);
      }
    };
  }, []);

  const button = (
    <button
      type="button"
      title={tip ? undefined : label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseEnter={
        tip
          ? () => {
              hovered.current = true;
              openTip();
            }
          : undefined
      }
      onMouseLeave={
        tip
          ? () => {
              hovered.current = false;
              closeTip();
            }
          : undefined
      }
      onFocus={tip ? openTip : undefined}
      onBlur={
        tip
          ? () => {
              if (!hovered.current) {
                closeTip();
              }
            }
          : undefined
      }
      onClick={(event) => {
        event.currentTarget.blur();
        onClick();
      }}
      className={`inline-flex size-8 items-center justify-center rounded-full outline-none disabled:opacity-40 ${
        pressed
          ? soft
            ? "border border-white/35 bg-white/12 text-white/80"
            : "bg-white text-black"
          : "border border-white/25 text-white hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );

  if (!tip) {
    return button;
  }

  return (
    <span className="relative">
      {button}
      {showTip ? (
        <span
          role="tooltip"
          className={`pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-md bg-white/90 px-2 py-1 text-black text-xs ${
            tipAlign === "end" ? "right-0" : "left-1/2 -translate-x-1/2"
          }`}
        >
          {label}
        </span>
      ) : null}
    </span>
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

function FullscreenIcon() {
  return (
    <PlayerIcon>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </PlayerIcon>
  );
}

function CloseIcon() {
  return (
    <PlayerIcon>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </PlayerIcon>
  );
}

function FullscreenExitIcon() {
  return (
    <PlayerIcon>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </PlayerIcon>
  );
}
