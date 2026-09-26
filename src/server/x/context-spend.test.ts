import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getClient: () => ({ execute }),
}));
vi.mock("@/server/settings", () => ({
  getContextSettings: async () => ({
    xApiEnabled: true,
    threadExpandEnabled: true,
    replyContextEnabled: false,
    monthlyCapUsd: 2,
  }),
}));

import { canSpendContext, monthContextSpendUsd } from "./context-spend";

beforeEach(() => {
  execute.mockReset();
});

describe("monthContextSpendUsd", () => {
  it("includes gone_sweep so the sweep shares the monthly cap", async () => {
    execute.mockResolvedValueOnce({ rows: [{ n: 1.5 }] });
    await expect(monthContextSpendUsd()).resolves.toBe(1.5);
    const sql = String(execute.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("'gone_sweep'");
    expect(sql).toContain("'thread'");
    expect(sql).toContain("'reply_context'");
  });
});

describe("canSpendContext", () => {
  it("blocks when the extra spend would exceed the cap", async () => {
    execute.mockResolvedValueOnce({ rows: [{ n: 1.9 }] });
    await expect(canSpendContext(0.5)).resolves.toBe(false);
  });

  it("allows spend within the cap", async () => {
    execute.mockResolvedValueOnce({ rows: [{ n: 1 }] });
    await expect(canSpendContext(0.5)).resolves.toBe(true);
  });
});
