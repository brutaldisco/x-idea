import { afterEach, describe, expect, it, vi } from "vitest";
import { probeRemoteByteLength } from "./probe-remote-bytes";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("probeRemoteByteLength", () => {
  it("prefers HEAD Content-Length", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { "content-length": "2048" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      probeRemoteByteLength("https://video.twimg.com/a.mp4"),
    ).resolves.toBe(2048);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD" });
  });

  it("uses Range Content-Range when HEAD is empty", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(
        new Response("x", {
          status: 206,
          headers: { "content-range": "bytes 0-0/4096" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      probeRemoteByteLength("https://video.twimg.com/a.mp4"),
    ).resolves.toBe(4096);
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      Range: "bytes=0-0",
    });
  });

  it("returns null when the CDN is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(
      probeRemoteByteLength("https://video.twimg.com/a.mp4"),
    ).resolves.toBeNull();
  });
});
