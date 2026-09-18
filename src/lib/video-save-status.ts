import type { QueryClient } from "@tanstack/react-query";
import { isLibrarySourcesData, LIBRARY_SOURCES_KEY } from "@/lib/library-cache";

export type VideoSaveStatusEvent = {
  sourceId?: string | null;
  mediaId?: string | null;
  videoSaveStatus: string | null;
  videoRelPath?: string | null;
};

export type VideoSaveStatusFields = {
  videoSaveStatus: string | null;
  videoRelPath?: string | null;
  hasQueueableVideos: boolean;
};

type Listener = (event: VideoSaveStatusEvent) => void;

const listeners = new Set<Listener>();

export function videoSaveIsInFlight(
  status: string | null | undefined,
): boolean {
  return status === "queued" || status === "downloading" || status === "ready";
}

export function libraryVideoSaveFields(
  event: VideoSaveStatusEvent,
): VideoSaveStatusFields {
  return {
    videoSaveStatus: event.videoSaveStatus,
    ...(event.videoRelPath !== undefined
      ? { videoRelPath: event.videoRelPath }
      : {}),
    hasQueueableVideos: !videoSaveIsInFlight(event.videoSaveStatus),
  };
}

export function videoSaveEventMatchesSource(
  event: VideoSaveStatusEvent,
  target: { sourceId: string; mediaId?: string | null },
): boolean {
  if (!event.sourceId || event.sourceId !== target.sourceId) {
    return false;
  }
  if (event.mediaId && target.mediaId && event.mediaId !== target.mediaId) {
    return false;
  }
  return true;
}

export function videoSaveEventMatchesMedia(
  event: VideoSaveStatusEvent,
  mediaId: string,
): boolean {
  return Boolean(event.mediaId) && event.mediaId === mediaId;
}

export function applySourceListVideoSave<
  T extends {
    id: string;
    mediaId?: string | null;
    videoSaveStatus?: string | null;
    videoRelPath?: string | null;
    hasQueueableVideos?: boolean;
  },
>(item: T, event: VideoSaveStatusEvent): T {
  if (
    !videoSaveEventMatchesSource(event, {
      sourceId: item.id,
      mediaId: item.mediaId,
    })
  ) {
    return item;
  }
  return { ...item, ...libraryVideoSaveFields(event) };
}

export function patchLibraryVideoSaveStatus(
  client: QueryClient,
  event: VideoSaveStatusEvent,
): void {
  if (!event.sourceId) {
    return;
  }
  const fields = libraryVideoSaveFields(event);
  client.setQueriesData({ queryKey: [LIBRARY_SOURCES_KEY] }, (old) => {
    if (!isLibrarySourcesData(old)) {
      return old;
    }
    let changed = false;
    const items = old.items.map((item) => {
      const row = item as { id: string; mediaId?: string | null };
      if (
        !videoSaveEventMatchesSource(event, {
          sourceId: row.id,
          mediaId: row.mediaId,
        })
      ) {
        return item;
      }
      changed = true;
      return { ...item, ...fields };
    });
    return changed ? { ...old, items } : old;
  });
}

export function subscribeVideoSaveStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function applyVideoSaveStatus(
  client: QueryClient | null | undefined,
  event: VideoSaveStatusEvent,
): void {
  if (client) {
    patchLibraryVideoSaveStatus(client, event);
  }
  for (const listener of listeners) {
    listener(event);
  }
}

export function applyVideoItemSaveStatus(
  client: QueryClient | null | undefined,
  item: {
    sourceId?: string | null;
    mediaId: string;
    relPath?: string | null;
  },
  videoSaveStatus: string | null,
  videoRelPath?: string | null,
): void {
  applyVideoSaveStatus(client, {
    sourceId: item.sourceId,
    mediaId: item.mediaId,
    videoSaveStatus,
    videoRelPath: videoRelPath !== undefined ? videoRelPath : item.relPath,
  });
}
