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
vi.mock("@/server/x/account", () => ({
  listXAccounts: async () => [{ id: "acc_1" }],
}));

import { setTaxonomyItemColor } from "@/server/taxonomy";

beforeEach(() => {
  execute.mockReset();
});

describe("setTaxonomyItemColor", () => {
  it("writes an accent token", async () => {
    execute
      .mockResolvedValueOnce({ rows: [{ id: "row" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            kind: "category",
            item_id: "cat_ai",
            name: "AI",
            color: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rowsAffected: 1, rows: [] });

    await expect(
      setTaxonomyItemColor({
        accountId: "acc_1",
        kind: "category",
        itemId: "cat_ai",
        color: "accent-04",
      }),
    ).resolves.toEqual({
      id: "cat_ai",
      name: "AI",
      color: "accent-04",
    });
    expect(execute).toHaveBeenLastCalledWith({
      sql: `UPDATE account_taxonomy SET color = ?
          WHERE x_account_id = ? AND kind = ? AND item_id = ?`,
      args: ["accent-04", "acc_1", "category", "cat_ai"],
    });
  });

  it("rejects an unknown token", async () => {
    execute.mockResolvedValueOnce({ rows: [{ id: "row" }] });
    await expect(
      setTaxonomyItemColor({
        accountId: "acc_1",
        kind: "category",
        itemId: "cat_ai",
        color: "accent-10",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
