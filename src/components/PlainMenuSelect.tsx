"use client";

import { useEffect, useId, useRef, useState } from "react";

export function PlainMenuSelect({
  value,
  ariaLabel,
  options,
  onChange,
  className,
}: {
  value: string;
  ariaLabel: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const current = options.find((item) => item.id === value);

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

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className ?? ""}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={listId}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setCoords({ top: rect.bottom + 4, left: rect.left });
          setOpen((value) => !value);
        }}
        className="max-w-[9.5rem] truncate rounded-full border border-line bg-paper px-2 py-1.5 text-left text-xs outline-none"
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
                  selected ? "bg-ink text-paper" : "hover:bg-paper-2"
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
