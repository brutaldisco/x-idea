"use client";

import Image from "next/image";
import { useSavedVideoThumb } from "@/lib/video-thumb-cache";

export function VideoThumbImg({
  relPath,
  src,
  alt,
  width,
  height,
  className,
  onError,
}: {
  relPath?: string | null;
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  onError?: () => void;
}) {
  const custom = useSavedVideoThumb(relPath);
  if (custom) {
    return (
      // 再生位置から切った JPEG。next/image の最適化対象にしない。
      // biome-ignore lint/performance/noImgElement: data URL thumbnail
      <img src={custom} alt={alt} className={className} />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      className={className}
      onError={onError}
    />
  );
}
