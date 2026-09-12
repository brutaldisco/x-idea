"use client";

import { useState } from "react";
import {
  loadRepeatMode,
  saveRepeatMode,
  VideoPlayer,
} from "@/components/videos/VideoPlayer";
import type { RepeatMode } from "@/lib/video-playlist";

export function SavedVideoPlayer({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const [repeat, setRepeat] = useState<RepeatMode>(() => loadRepeatMode());

  function changeRepeat(mode: RepeatMode) {
    setRepeat(mode);
    saveRepeatMode(mode);
  }

  return (
    <VideoPlayer
      url={url}
      title={title}
      folderLabel="保存済み"
      index={0}
      total={1}
      repeat={repeat}
      onRepeatChange={changeRepeat}
      onClose={onClose}
      onPrev={() => undefined}
      onNext={() => undefined}
      onEnded={() => {
        if (repeat === "off") {
          onClose();
        }
      }}
    />
  );
}
