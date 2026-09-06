import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getClient: () => ({ execute }),
}));

import {
  advanceSyncHeadIfNeeded,
  isDismissedBookmark,
  rememberDismissedBookmark,
} from "./dismiss";

function sqlOf(call: unknown): string {
  if (call && typeof call === "object" && "sql" in call) {
    return String((call as { sql: string }).sql);
  }
  return "";
}

beforeEach(() => {
  execute.mockReset();
});

describe("rememberDismissedBookmark", () => {
  it("inserts the account and tweet pair", async () => {
    execute.mockResolvedValue({ rows: [] });
    await rememberDismissedBookmark("acc1", "tw1");
    expect(sqlOf(execute.mock.calls[0]?.[0])).toContain("dismissed_bookmarks");
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      args: ["acc1", "tw1"],
    });
  });
});

describe("isDismissedBookmark", () => {
  it("is true when a row exists", async () => {
    execute.mockResolvedValue({ rows: [{ tweet_id: "tw1" }] });
    await expect(isDismissedBookmark("acc1", "tw1")).resolves.toBe(true);
  });

  it("is false when missing", async () => {
    execute.mockResolvedValue({ rows: [] });
    await expect(isDismissedBookmark("acc1", "tw1")).resolves.toBe(false);
  });
});

describe("advanceSyncHeadIfNeeded", () => {
  it("does nothing when the removed tweet is not the sync head", async () => {
    execute.mockResolvedValueOnce({
      rows: [{ last_sync_head_tweet_id: "other" }],
    });
    await advanceSyncHeadIfNeeded("acc1", "tw1");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("moves the head to the newest remaining tweet", async () => {
    execute
      .mockResolvedValueOnce({ rows: [{ last_sync_head_tweet_id: "tw1" }] })
      .mockResolvedValueOnce({ rows: [{ tweet_id: "tw2" }] })
      .mockResolvedValueOnce({ rows: [] });
    await advanceSyncHeadIfNeeded("acc1", "tw1");
    expect(sqlOf(execute.mock.calls[2]?.[0])).toContain(
      "last_sync_head_tweet_id",
    );
    expect(execute.mock.calls[2]?.[0]).toMatchObject({
      args: ["tw2", "acc1"],
    });
  });
});
