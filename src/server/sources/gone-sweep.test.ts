import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  execute,
  fetchTweetsByIds,
  applyTweetLookupGaps,
  canSpendContext,
  writeContextRun,
} = vi.hoisted(() => ({
  execute: vi.fn(),
  fetchTweetsByIds: vi.fn(),
  applyTweetLookupGaps: vi.fn(),
  canSpendContext: vi.fn(),
  writeContextRun: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getClient: () => ({ execute }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/server/ingest/bookmark", () => ({ applyTweetLookupGaps }));
vi.mock("@/server/x/client", () => ({ fetchTweetsByIds }));
vi.mock("@/server/x/context-spend", () => ({
  canSpendContext,
  writeContextRun,
}));

import { runGoneSweepAndRecord } from "./gone-sweep";

beforeEach(() => {
  execute.mockReset();
  fetchTweetsByIds.mockReset();
  applyTweetLookupGaps.mockReset();
  canSpendContext.mockReset();
  writeContextRun.mockReset();
});

describe("runGoneSweepAndRecord monthly cap", () => {
  it("skips the sweep without calling the X API when over the cap", async () => {
    canSpendContext.mockResolvedValueOnce(false);
    const out = await runGoneSweepAndRecord({
      accountId: "a1",
      accessToken: "token",
      cursor: "2026-09-01 00:00:00\ts0",
    });
    expect(out).toEqual({
      purged: 0,
      nextCursor: "2026-09-01 00:00:00\ts0",
    });
    expect(fetchTweetsByIds).not.toHaveBeenCalled();
    expect(writeContextRun).not.toHaveBeenCalled();
  });

  it("runs the sweep as before when within the cap", async () => {
    canSpendContext.mockResolvedValueOnce(true);
    execute.mockResolvedValueOnce({
      rows: [
        { source_id: "s1", tweet_id: "t1", saved_at: "2026-09-01 00:00:00" },
      ],
    });
    fetchTweetsByIds.mockResolvedValueOnce({
      tweets: [],
      users: new Map(),
      media: new Map(),
      includedTweets: new Map(),
      errors: [],
      nextToken: null,
      resourcesRead: 1,
      rateLimit: { remaining: null, reset: null },
    });
    applyTweetLookupGaps.mockResolvedValueOnce({ purged: 1, unavailable: 0 });

    const out = await runGoneSweepAndRecord({
      accountId: "a1",
      accessToken: "token",
      cursor: null,
    });
    expect(out.purged).toBe(1);
    expect(out.nextCursor).toBe("2026-09-01 00:00:00\ts1");
    expect(writeContextRun).toHaveBeenCalledWith({
      accountId: "a1",
      mode: "gone_sweep",
      resources: 1,
      status: "ok",
    });
  });
});
