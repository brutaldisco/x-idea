"use client";

import Image from "next/image";
import { type CSSProperties, useEffect, useState } from "react";

export function PhotoLightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <button
      type="button"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-8"
      onClick={onClose}
      aria-label="拡大を閉じる"
    >
      <Image
        src={src}
        alt=""
        width={1600}
        height={1200}
        unoptimized
        className="max-h-full max-w-full rounded-lg object-contain"
      />
    </button>
  );
}

export function ExpandablePhoto({
  src,
  alt,
  width,
  height,
  className,
  wrapperClassName,
  style,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  wrapperClassName?: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="画像を拡大"
        className={wrapperClassName}
        style={style}
      >
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          unoptimized
          className={className}
        />
      </button>
      {open ? <PhotoLightbox src={src} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
