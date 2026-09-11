import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, listXAccounts } = vi.hoisted(() => ({
  execute: vi.fn(),
  listXAccounts: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getClient: () => ({ execute }),
  isDbConfigured: () => true,
}));
vi.mock("@/db/ensure", () => ({
  ensureSchema: async () => {},
}));
vi.mock("@/server/x/account", () => ({
  listXAccounts,
}));

import { taxonomyForAccount } from "@/server/taxonomy";

beforeEach(() => {
  execute.mockReset();
  listXAccounts.mockReset();
  listXAccounts.mockRejectedValue(new Error("listXAccounts should not run"));
});

describe("taxonomyForAccount", () => {
  it("reads taxonomy without asserting the account list", async () => {
    execute.mockResolvedValueOnce({
      rows: [
        {
          kind: "category",
          item_id: "cat_ai",
          name: "AI",
          color: "accent-02",
        },
        { kind: "info_type", item_id: "idea", name: "着想", color: null },
      ],
    });
    await expect(taxonomyForAccount("acc_1")).resolves.toEqual({
      categories: [{ id: "cat_ai", name: "AI", color: "accent-02" }],
      infoTypes: [{ id: "idea", name: "着想", color: null }],
    });
    expect(listXAccounts).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("falls back to defaults when the account has no rows", async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    const taxonomy = await taxonomyForAccount("acc_1");
    expect(taxonomy.categories.map((row) => row.name)).toContain("社会学");
    expect(taxonomy.infoTypes.map((row) => row.id)).toContain("idea");
  });
});
