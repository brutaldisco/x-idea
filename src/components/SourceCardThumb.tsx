"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { SavedVideoThumbButton } from "@/components/SavedVideoThumbButton";
import { sourceTransitionStyle } from "@/lib/view-transition";

export function SourceCardThumb({
  sourceId,
  href,
  title,
  thumbUrl,
  imageWidth,
  imageHeight,
  wrapperClassName,
  imageClassName,
  mediaId,
  mediaType,
  videoSaveStatus,
  videoRelPath,
  children,
}: {
  sourceId: string;
  href: string;
  title: string;
  thumbUrl: string;
  imageWidth: number;
  imageHeight: number;
  wrapperClassName: string;
  imageClassName: string;
  mediaId?: string | null;
  mediaType?: string | null;
  videoSaveStatus?: string | null;
  videoRelPath?: string | null;
  children?: ReactNode;
}) {
  const playable =
    Boolean(mediaId) && mediaType !== "photo" && videoSaveStatus === "ready";

  const image = (
    <Image
      src={thumbUrl}
      alt=""
      width={imageWidth}
      height={imageHeight}
      unoptimized
      loading="lazy"
      decoding="async"
      className={imageClassName}
    />
  );

  if (playable && mediaId) {
    return (
      <SavedVideoThumbButton
        mediaId={mediaId}
        videoRelPath={videoRelPath}
        title={title}
        className={`${wrapperClassName} w-full cursor-pointer text-left`}
      >
        {image}
        {children}
      </SavedVideoThumbButton>
    );
  }

  return (
    <Link
      href={href}
      transitionTypes={["nav-forward"]}
      className={wrapperClassName}
      style={sourceTransitionStyle(sourceId)}
    >
      {image}
      {children}
    </Link>
  );
}
