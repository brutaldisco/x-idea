"use client";

import type { CSSProperties, ReactNode } from "react";
import { SavedVideoPlayer } from "@/components/SavedVideoPlayer";
import { useSavedVideoPlayback } from "@/components/useSavedVideoPlayback";

export function SavedVideoThumbButton({
  mediaId,
  videoRelPath,
  title,
  className,
  style,
  children,
}: {
  mediaId: string;
  videoRelPath?: string | null;
  title: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const { session, play, close } = useSavedVideoPlayback();

  return (
    <>
      <button
        type="button"
        aria-label={`${title} を再生`}
        className={className}
        style={style}
        onClick={() => {
          void play({ mediaId, videoRelPath, title });
        }}
      >
        {children}
      </button>
      {session ? (
        <SavedVideoPlayer
          url={session.url}
          title={session.title}
          onClose={close}
        />
      ) : null}
    </>
  );
}
