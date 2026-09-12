import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getClient: () => ({ execute }),
}));
vi.mock("@/db/ensure", () => ({
  ensureSchema: async () => {},
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  getVideoSaveFolderName,
  setVideoSaveFolderName,
} from "@/server/settings";

beforeEach(() => {
  execute.mockReset();
});

describe("account video save folder", () => {
  it("reads the folder name for one account", async () => {
    execute.mockResolvedValueOnce({
      rows: [{ video_save_folder_name: "Deathisnotf1nal 002" }],
    });
    await expect(getVideoSaveFolderName("acc_1")).resolves.toBe(
      "Deathisnotf1nal 002",
    );
    expect(execute).toHaveBeenCalledWith({
      sql: "SELECT video_save_folder_name FROM x_account WHERE id = ? LIMIT 1",
      args: ["acc_1"],
    });
  });

  it("writes the folder name to that account only", async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    await setVideoSaveFolderName("acc_2", "  Library B  ");
    expect(execute).toHaveBeenCalledWith({
      sql: `UPDATE x_account
          SET video_save_folder_name = ?, updated_at = datetime('now')
          WHERE id = ?`,
      args: ["Library B", "acc_2"],
    });
  });
});
