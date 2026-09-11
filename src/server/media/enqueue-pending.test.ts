import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, enqueueJob } = vi.hoisted(() => ({
  execute: vi.fn(),
  enqueueJob: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getClient: () => ({ execute }),
}));
vi.mock("@/server/jobs/queue", () => ({
  enqueueJob,
}));

import {
  enqueuePendingMediaDownloads,
  MEDIA_QUEUE_TARGET,
} from "@/server/media/enqueue-pending";

beforeEach(() => {
  execute.mockReset();
  enqueueJob.mockReset();
  enqueueJob.mockResolvedValue(true);
});

describe("enqueuePendingMediaDownloads", () => {
  it("does not enqueue when the media queue is already full", async () => {
    execute.mockResolvedValueOnce({ rows: [{ n: MEDIA_QUEUE_TARGET }] });
    await expect(enqueuePendingMediaDownloads("acc_1")).resolves.toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("fills only the remaining room", async () => {
    execute
      .mockResolvedValueOnce({ rows: [{ n: MEDIA_QUEUE_TARGET - 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: "m1" }, { id: "m2" }] });
    await expect(enqueuePendingMediaDownloads("acc_1")).resolves.toBe(2);
    expect(execute).toHaveBeenNthCalledWith(2, {
      sql: `SELECT m.id FROM media_assets m
          JOIN x_posts p ON p.id = m.x_post_id
          LEFT JOIN sources s ON s.x_post_id = p.id
          WHERE m.download_status IN ('pending', 'failed')
            AND (s.x_account_id = ? OR s.x_account_id IS NULL)
          ORDER BY m.created_at DESC
          LIMIT ?`,
      args: ["acc_1", 2],
    });
    expect(enqueueJob).toHaveBeenCalledTimes(2);
  });
});
