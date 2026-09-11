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

import { clearSourceTaxonomyBadges } from "@/server/taxonomy";

beforeEach(() => {
  execute.mockReset();
});

describe("clearSourceTaxonomyBadges", () => {
  it("clears source assignments without deleting taxonomy items", async () => {
    execute.mockResolvedValueOnce({ rows: [], rowsAffected: 4 });

    await expect(clearSourceTaxonomyBadges("acc_1")).resolves.toEqual({
      cleared: 4,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      sql: `UPDATE sources
          SET category_id = NULL,
              category_source = 'none',
              category_confidence = NULL,
              info_type = NULL,
              info_type_source = 'none',
              updated_at = datetime('now')
          WHERE x_account_id = ?
            AND (category_id IS NOT NULL OR info_type IS NOT NULL)`,
      args: ["acc_1"],
    });
  });
});
