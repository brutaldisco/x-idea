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
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("@/server/x/account", () => ({
  listXAccounts: async () => [{ id: "acc_1" }],
}));

import { AppError } from "@/lib/errors";
import { reorderTaxonomyItems } from "@/server/taxonomy";

function taxonomyRows(items: { kind: string; id: string; name: string }[]) {
  return {
    rows: items.map((row) => ({
      kind: row.kind,
      item_id: row.id,
      name: row.name,
    })),
  };
}

beforeEach(() => {
  execute.mockReset();
});

describe("reorderTaxonomyItems", () => {
  it("writes sort_order for the new category order", async () => {
    execute
      .mockResolvedValueOnce({ rows: [{ id: "row" }] })
      .mockResolvedValueOnce(
        taxonomyRows([
          { kind: "category", id: "cat_a", name: "A" },
          { kind: "category", id: "cat_b", name: "B" },
        ]),
      )
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(
        taxonomyRows([
          { kind: "category", id: "cat_b", name: "B" },
          { kind: "category", id: "cat_a", name: "A" },
        ]),
      );

    const next = await reorderTaxonomyItems({
      accountId: "acc_1",
      kind: "category",
      itemIds: ["cat_b", "cat_a"],
    });

    expect(execute).toHaveBeenNthCalledWith(3, {
      sql: `UPDATE account_taxonomy SET sort_order = ?
            WHERE x_account_id = ? AND kind = ? AND item_id = ?`,
      args: [10, "acc_1", "category", "cat_b"],
    });
    expect(execute).toHaveBeenNthCalledWith(4, {
      sql: `UPDATE account_taxonomy SET sort_order = ?
            WHERE x_account_id = ? AND kind = ? AND item_id = ?`,
      args: [20, "acc_1", "category", "cat_a"],
    });
    expect(next.categories.map((row) => row.id)).toEqual(["cat_b", "cat_a"]);
  });

  it("rejects an incomplete list", async () => {
    execute
      .mockResolvedValueOnce({ rows: [{ id: "row" }] })
      .mockResolvedValueOnce(
        taxonomyRows([
          { kind: "category", id: "cat_a", name: "A" },
          { kind: "category", id: "cat_b", name: "B" },
        ]),
      );
    await expect(
      reorderTaxonomyItems({
        accountId: "acc_1",
        kind: "category",
        itemIds: ["cat_a"],
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
