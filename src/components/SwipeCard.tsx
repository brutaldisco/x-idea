"use client";

import { type ReactNode, useRef, useState } from "react";
import {
  resolveSwipeIntent,
  type SwipeAxis,
  type SwipeIntent,
  swipeAxis,
  swipeHint,
  swipeOffset,
} from "@/lib/swipe";

const HINTS: Record<SwipeIntent, { label: string; className: string }> = {
  confirm: {
    label: "確定",
    className: "right-3 top-3 bg-ok text-paper",
  },
  archive: {
    label: "アーカイブ",
    className: "top-3 left-3 bg-ink-2 text-paper",
  },
  snooze: {
    label: "後で",
    className: "inset-x-0 top-3 mx-auto w-fit bg-warn text-ink",
  },
};

function isInteractive(target: EventTarget | null): boolean {
  return Boolean(
    target instanceof Element &&
      target.closest("button, a, select, textarea, input, label"),
  );
}

export function SwipeCard({
  disabled,
  onConfirm,
  onArchive,
  onSnooze,
  onOpen,
  children,
}: {
  disabled?: boolean;
  onConfirm: () => void;
  onArchive: () => void;
  onSnooze: () => void;
  onOpen: () => void;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const axisRef = useRef<SwipeAxis | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const hint = swipeHint(offset.x, offset.y, axisRef.current);

  function reset() {
    start.current = null;
    axisRef.current = null;
    offsetRef.current = { x: 0, y: 0 };
    setOffset({ x: 0, y: 0 });
    setDragging(false);
  }

  function commit() {
    const intent = resolveSwipeIntent(offsetRef.current.x, offsetRef.current.y);
    reset();
    if (intent === "confirm") {
      onConfirm();
      return;
    }
    if (intent === "archive") {
      onArchive();
      return;
    }
    if (intent === "snooze") {
      onSnooze();
    }
  }

  return (
    <article
      className="relative min-h-48 touch-pan-y overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper-2 p-4 shadow-[var(--shadow-card)]"
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px) rotate(${offset.x * 0.04}deg)`,
        transition: dragging ? "none" : "transform 160ms var(--ease-spring)",
      }}
      onPointerDown={(event) => {
        if (disabled || isInteractive(event.target)) {
          return;
        }
        start.current = { x: event.clientX, y: event.clientY };
        axisRef.current = null;
      }}
      onPointerMove={(event) => {
        if (!start.current || disabled) {
          return;
        }
        const dx = event.clientX - start.current.x;
        const dy = event.clientY - start.current.y;
        const axis = axisRef.current ?? swipeAxis(dx, dy);
        if (!axis) {
          return;
        }
        if (axis === "y" && dy > 0) {
          return;
        }
        axisRef.current = axis;
        if (!dragging) {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }
        const next = swipeOffset(dx, dy, axis);
        offsetRef.current = next;
        setOffset(next);
      }}
      onPointerUp={(event) => {
        if (!start.current) {
          return;
        }
        const dx = offsetRef.current.x;
        const dy = offsetRef.current.y;
        const moved = Math.hypot(dx, dy);
        const intent = resolveSwipeIntent(dx, dy);
        if (intent) {
          commit();
          return;
        }
        const wasTap = moved < 8 && !isInteractive(event.target);
        reset();
        if (wasTap && !disabled) {
          onOpen();
        }
      }}
      onPointerCancel={reset}
    >
      {hint.intent ? (
        <p
          aria-hidden
          className={`pointer-events-none absolute z-10 rounded-full px-3 py-1 font-medium text-xs ${HINTS[hint.intent].className}`}
          style={{ opacity: hint.progress }}
        >
          {HINTS[hint.intent].label}
        </p>
      ) : null}
      {children}
    </article>
  );
}
