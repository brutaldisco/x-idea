"use client";

import { useEffect, useState } from "react";
import {
  libraryVideoSaveFields,
  subscribeVideoSaveStatus,
  type VideoSaveStatusFields,
  videoSaveEventMatchesMedia,
  videoSaveEventMatchesSource,
} from "@/lib/video-save-status";

export function useLiveSourceVideoSave(
  sourceId: string,
  mediaId: string | null | undefined,
  initial: {
    videoSaveStatus?: string | null;
    videoRelPath?: string | null;
    hasQueueableVideos?: boolean;
  },
): VideoSaveStatusFields {
  const [live, setLive] = useState<VideoSaveStatusFields>({
    videoSaveStatus: initial.videoSaveStatus ?? null,
    videoRelPath: initial.videoRelPath,
    hasQueueableVideos: Boolean(initial.hasQueueableVideos),
  });

  useEffect(() => {
    setLive({
      videoSaveStatus: initial.videoSaveStatus ?? null,
      videoRelPath: initial.videoRelPath,
      hasQueueableVideos: Boolean(initial.hasQueueableVideos),
    });
  }, [
    initial.hasQueueableVideos,
    initial.videoRelPath,
    initial.videoSaveStatus,
  ]);

  useEffect(() => {
    return subscribeVideoSaveStatus((event) => {
      if (!videoSaveEventMatchesSource(event, { sourceId, mediaId })) {
        return;
      }
      setLive((prev) => ({
        ...prev,
        ...libraryVideoSaveFields(event),
      }));
    });
  }, [mediaId, sourceId]);

  return live;
}

export function useLiveMediaVideoSave(
  mediaId: string,
  initial: {
    videoSaveStatus?: string | null;
    videoRelPath?: string | null;
  },
): { videoSaveStatus: string | null; videoRelPath?: string | null } {
  const [live, setLive] = useState({
    videoSaveStatus: initial.videoSaveStatus ?? null,
    videoRelPath: initial.videoRelPath,
  });

  useEffect(() => {
    setLive({
      videoSaveStatus: initial.videoSaveStatus ?? null,
      videoRelPath: initial.videoRelPath,
    });
  }, [initial.videoRelPath, initial.videoSaveStatus]);

  useEffect(() => {
    return subscribeVideoSaveStatus((event) => {
      if (!videoSaveEventMatchesMedia(event, mediaId)) {
        return;
      }
      setLive((prev) => ({
        videoSaveStatus: event.videoSaveStatus,
        videoRelPath:
          event.videoRelPath !== undefined
            ? event.videoRelPath
            : prev.videoRelPath,
      }));
    });
  }, [mediaId]);

  return live;
}
