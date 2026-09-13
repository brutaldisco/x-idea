import { afterEach, describe, expect, it, vi } from "vitest";
import { probeDirectTotalBytes } from "./video-direct-fetch";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("probeDirectTotalBytes", () => {
  it("uses HEAD Content-Length when present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { "content-length": "4096" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      probeDirectTotalBytes("https://video.twimg.com/a.mp4"),
    ).resolves.toBe(4096);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "HEAD",
      referrerPolicy: "no-referrer",
    });
  });

  it("falls back to Range 0-0 when HEAD has no length", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405, headers: {} }))
      .mockResolvedValueOnce(
        new Response("x", {
          status: 206,
          headers: {
            "content-range": "bytes 0-0/8192",
            "content-length": "1",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      probeDirectTotalBytes("https://video.twimg.com/a.mp4"),
    ).resolves.toBe(8192);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      referrerPolicy: "no-referrer",
      headers: { Range: "bytes=0-0" },
    });
  });

  it("returns null when both probes fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(
      probeDirectTotalBytes("https://video.twimg.com/a.mp4"),
    ).resolves.toBeNull();
  });
});
