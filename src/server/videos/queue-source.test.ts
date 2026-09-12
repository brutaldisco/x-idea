import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getClient: () => ({ execute }),
  isDbConfigured: () => true,
}));
vi.mock("@/db/ensure", () => ({
  ensureSchema: async () => {},
}));
vi.mock("@/server/media/account", () => ({
  accountIdForMedia: async () => "acc1",
}));
vi.mock("@/server/media/download", () => ({
  loadMediaRow: async () => ({ type: "video", variants_json: "[]" }),
}));
vi.mock("@/server/media/refresh", () => ({
  refreshMediaFromTweet: async () => {},
}));
vi.mock("@/server/media/select", () => ({
  parseVariantsJson: () => [],
  pickBestMp4Url: () => "https://example.com/a.mp4",
  videoVariantMeta: () => ({ qualityLabel: null, estimatedBytes: null }),
}));

import type { AppError } from "@/lib/errors";
import { enqueueSourceVideos } from "@/server/videos/queue";
import type { AccountContext } from "@/server/x/context";

const ctx: AccountContext = {
  kind: "account",
  account: {
    id: "acc1",
    username: "me",
    name: "Me",
    status: "active",
    syncEnabled: true,
    lastSyncedAt: null,
    backfillExhausted: false,
  },
};

beforeEach(() => {
  execute.mockReset();
});

describe("enqueueSourceVideos", () => {
  it("rejects a source without a post", async () => {
    execute.mockResolvedValueOnce({
      rows: [
        { id: "src1", kind: "note", x_post_id: null, x_account_id: "acc1" },
      ],
    });
    await expect(enqueueSourceVideos("src1", ctx)).rejects.toMatchObject({
      code: "VALIDATION",
    } satisfies Partial<AppError>);
  });

  it("rejects a post with no videos", async () => {
    execute
      .mockResolvedValueOnce({
        rows: [
          { id: "src1", kind: "x_post", x_post_id: "p1", x_account_id: "acc1" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    await expect(enqueueSourceVideos("src1", ctx)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});
