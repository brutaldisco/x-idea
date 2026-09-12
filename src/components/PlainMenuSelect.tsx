"use client";

import { useEffect, useId, useRef, useState } from "react";
import { taxonomyAccentClass } from "@/lib/taxonomy-accent";

export type PlainMenuOption = {
  id: string;
  label: string;
  color?: string | null;
};

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
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const current = options.find((item) => item.id === value);
  const currentAccent = taxonomyAccentClass(current?.color);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
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

  return (
    <div
      ref={rootRef}
      className={`relative ${badge ? "min-w-0 max-w-full" : "shrink-0"} ${className ?? ""}`}
    >
      <button
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
          const rect = event.currentTarget.getBoundingClientRect();
          const menuWidth = 144;
          setCoords({
            top: rect.bottom + 4,
            left: Math.min(
              rect.left,
              Math.max(8, window.innerWidth - menuWidth - 8),
            ),
          });
          setOpen((currentOpen) => !currentOpen);
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
      {open && coords ? (
        <div
          id={listId}
          role="menu"
          aria-label={ariaLabel}
          className="fixed z-50 max-h-64 min-w-36 overflow-auto rounded-xl border border-line bg-paper py-1 shadow-card"
          style={{ top: coords.top, left: coords.left }}
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
      ) : null}
    </div>
  );
}
