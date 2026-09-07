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

import { AppError } from "@/lib/errors";
import {
  clearDefaultXAccountIf,
  getDefaultXAccountId,
  setDefaultXAccountId,
} from "@/server/settings";

beforeEach(() => {
  execute.mockReset();
});

describe("default x account setting", () => {
  it("reads a stored id", async () => {
    execute.mockResolvedValueOnce({
      rows: [{ default_x_account_id: "acc_2" }],
    });
    await expect(getDefaultXAccountId()).resolves.toBe("acc_2");
  });

  it("returns null when unset", async () => {
    execute.mockResolvedValueOnce({ rows: [{}] });
    await expect(getDefaultXAccountId()).resolves.toBeNull();
  });

  it("rejects an unknown account", async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    await expect(setDefaultXAccountId("missing")).rejects.toBeInstanceOf(
      AppError,
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("updates settings when the account exists", async () => {
    execute
      .mockResolvedValueOnce({ rows: [{ id: "acc_2" }] })
      .mockResolvedValueOnce({ rows: [] });
    await setDefaultXAccountId("acc_2");
    expect(execute).toHaveBeenNthCalledWith(2, {
      sql: `UPDATE settings SET default_x_account_id = ?, updated_at = datetime('now')
          WHERE id = 1`,
      args: ["acc_2"],
    });
  });

  it("clears the default only when it matches", async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    await clearDefaultXAccountIf("acc_2");
    expect(execute).toHaveBeenCalledWith({
      sql: `UPDATE settings SET default_x_account_id = NULL, updated_at = datetime('now')
          WHERE id = 1 AND default_x_account_id = ?`,
      args: ["acc_2"],
    });
  });
});
