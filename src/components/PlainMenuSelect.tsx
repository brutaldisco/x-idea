"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  estimatePlainMenuHeight,
  placePlainMenu,
} from "@/lib/plain-menu-place";
import { taxonomyAccentClass } from "@/lib/taxonomy-accent";

export type PlainMenuOption = {
  id: string;
  label: string;
  color?: string | null;
};

function coordsFromButton(
  button: HTMLButtonElement,
  menu: HTMLDivElement | null,
  optionCount: number,
): { top: number; left: number; maxHeight: number } | null {
  const rect = button.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > window.innerHeight) {
    return null;
  }
  return placePlainMenu({
    buttonTop: rect.top,
    buttonBottom: rect.bottom,
    buttonLeft: rect.left,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    menuHeight: menu?.scrollHeight ?? estimatePlainMenuHeight(optionCount),
  });
}

export function PlainMenuSelect({
  value,
  ariaLabel,
  options,
  onChange,
  className,
  buttonClassName,
  variant = "default",
  disabled = false,
}: {
  value: string;
  ariaLabel: string;
  options: PlainMenuOption[];
  onChange: (value: string) => void;
  className?: string;
  buttonClassName?: string;
  variant?: "default" | "badge";
  disabled?: boolean;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const current = options.find((item) => item.id === value);
  const currentAccent = taxonomyAccentClass(current?.color);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const sync = () => {
      const button = buttonRef.current;
      if (!button) {
        return;
      }
      const next = coordsFromButton(button, menuRef.current, options.length);
      if (!next) {
        setOpen(false);
        return;
      }
      setCoords(next);
    };
    sync();
    let raf = 0;
    const onMove = () => {
      if (raf) {
        return;
      }
      raf = requestAnimationFrame(() => {
        raf = 0;
        sync();
      });
    };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    window.visualViewport?.addEventListener("resize", onMove);
    window.visualViewport?.addEventListener("scroll", onMove);
    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      window.visualViewport?.removeEventListener("resize", onMove);
      window.visualViewport?.removeEventListener("scroll", onMove);
    };
  }, [open, options.length]);

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
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const badge = variant === "badge";
  const menu =
    open && coords ? (
      <div
        ref={menuRef}
        id={listId}
        role="menu"
        aria-label={ariaLabel}
        className="fixed z-[80] min-w-36 overflow-auto overscroll-contain rounded-xl border border-line bg-paper py-1 shadow-card"
        style={{
          top: coords.top,
          left: coords.left,
          maxHeight: coords.maxHeight,
        }}
      >
        {options.map((item) => {
          const selected = item.id === value;
          const accent = taxonomyAccentClass(item.color);
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(item.id);
                setOpen(false);
              }}
              className={`block w-full truncate px-3 py-2 text-left text-xs outline-none ${
                accent
                  ? `${accent} ${selected ? "ring-2 ring-ink ring-inset" : ""}`
                  : selected
                    ? "bg-ink text-paper"
                    : "hover:bg-paper-2"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <div
      ref={rootRef}
      className={`relative ${badge ? "min-w-0 max-w-full" : "shrink-0"} ${className ?? ""}`}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={listId}
        disabled={disabled}
        title={current?.label ?? ariaLabel}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (open) {
            setOpen(false);
            return;
          }
          const next = coordsFromButton(
            event.currentTarget,
            menuRef.current,
            options.length,
          );
          if (next) {
            setCoords(next);
            setOpen(true);
          }
        }}
        className={
          badge
            ? `min-w-0 max-w-full overflow-hidden whitespace-nowrap rounded-full px-1.5 py-0.5 text-left text-[10px] leading-none outline-none disabled:opacity-40 ${
                currentAccent || "bg-paper text-ink-2"
              } ${buttonClassName ?? ""}`
            : `truncate rounded-full border px-2 py-1.5 text-left text-xs outline-none disabled:opacity-40 ${
                currentAccent
                  ? `${currentAccent} border-transparent`
                  : "border-line bg-paper"
              } ${buttonClassName ?? "max-w-[9.5rem]"}`
        }
      >
        {current?.label ?? ariaLabel}
      </button>
      {menu && typeof document !== "undefined"
        ? createPortal(menu, document.body)
        : null}
    </div>
  );
}
