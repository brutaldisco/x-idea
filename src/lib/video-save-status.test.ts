import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  applySourceListVideoSave,
  applyVideoSaveStatus,
  libraryVideoSaveFields,
  subscribeVideoSaveStatus,
  videoSaveEventMatchesMedia,
  videoSaveEventMatchesSource,
} from "@/lib/video-save-status";

describe("video save status sync", () => {
  it("treats queued downloading and ready as not queueable", () => {
    expect(libraryVideoSaveFields({ videoSaveStatus: "queued" })).toEqual({
      videoSaveStatus: "queued",
      hasQueueableVideos: false,
    });
    expect(
      libraryVideoSaveFields({
        videoSaveStatus: "ready",
        videoRelPath: "a/b.mp4",
      }),
    ).toEqual({
      videoSaveStatus: "ready",
      videoRelPath: "a/b.mp4",
      hasQueueableVideos: false,
    });
    expect(libraryVideoSaveFields({ videoSaveStatus: "failed" })).toEqual({
      videoSaveStatus: "failed",
      hasQueueableVideos: true,
    });
  });

  it("matches the cover media and skips a different media on the same source", () => {
    expect(
      videoSaveEventMatchesSource(
        { sourceId: "s1", mediaId: "m1", videoSaveStatus: "ready" },
        { sourceId: "s1", mediaId: "m1" },
      ),
    ).toBe(true);
    expect(
      videoSaveEventMatchesSource(
        { sourceId: "s1", mediaId: "m2", videoSaveStatus: "ready" },
        { sourceId: "s1", mediaId: "m1" },
      ),
    ).toBe(false);
    expect(
      videoSaveEventMatchesSource(
        { sourceId: "s1", videoSaveStatus: "queued" },
        { sourceId: "s1", mediaId: "m1" },
      ),
    ).toBe(true);
    expect(
      videoSaveEventMatchesMedia(
        { sourceId: "s1", mediaId: "m1", videoSaveStatus: "ready" },
        "m1",
      ),
    ).toBe(true);
  });

  it("patches the matching library row and notifies listeners", () => {
    const client = new QueryClient();
    const key = ["sources", "posted_desc", "{}", 1];
    client.setQueryData(key, {
      items: [
        {
          id: "s1",
          mediaId: "m1",
          videoSaveStatus: "queued",
          hasQueueableVideos: false,
        },
        {
          id: "s2",
          mediaId: "m9",
          videoSaveStatus: "queued",
          hasQueueableVideos: false,
        },
      ],
      nextCursor: null,
      count: 2,
    });
    const seen: string[] = [];
    const stop = subscribeVideoSaveStatus((event) => {
      seen.push(`${event.sourceId}:${event.videoSaveStatus}`);
    });
    applyVideoSaveStatus(client, {
      sourceId: "s1",
      mediaId: "m1",
      videoSaveStatus: "ready",
      videoRelPath: "acc/video.mp4",
    });
    stop();
    expect(seen).toEqual(["s1:ready"]);
    expect(
      client.getQueryData<{
        items: Array<{
          id: string;
          videoSaveStatus: string;
          videoRelPath?: string;
          hasQueueableVideos: boolean;
        }>;
      }>(key)?.items,
    ).toEqual([
      {
        id: "s1",
        mediaId: "m1",
        videoSaveStatus: "ready",
        videoRelPath: "acc/video.mp4",
        hasQueueableVideos: false,
      },
      {
        id: "s2",
        mediaId: "m9",
        videoSaveStatus: "queued",
        hasQueueableVideos: false,
      },
    ]);
  });

  it("does not rewrite a card whose cover is another video", () => {
    const item = {
      id: "s1",
      mediaId: "cover",
      videoSaveStatus: "queued" as string | null,
      hasQueueableVideos: false,
    };
    expect(
      applySourceListVideoSave(item, {
        sourceId: "s1",
        mediaId: "other",
        videoSaveStatus: "ready",
      }),
    ).toEqual(item);
    expect(
      applySourceListVideoSave(item, {
        sourceId: "s1",
        mediaId: "cover",
        videoSaveStatus: "ready",
        videoRelPath: "ok.mp4",
      }).videoSaveStatus,
    ).toBe("ready");
  });
});
