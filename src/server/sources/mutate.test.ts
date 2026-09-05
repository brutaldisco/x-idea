import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, enqueueEnrichBatch } = vi.hoisted(() => ({
  execute: vi.fn(),
  enqueueEnrichBatch: vi.fn(async () => true),
}));

vi.mock("@/db/client", () => ({
  getClient: () => ({ execute }),
  isDbConfigured: () => true,
}));
vi.mock("@/db/ensure", () => ({
  ensureSchema: async () => {},
}));
vi.mock("@/server/jobs/enrich", () => ({
  enqueueEnrichBatch,
}));
vi.mock("@/lib/ids", () => ({
  newId: () => "fb_test",
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  archiveSource,
  confirmSource,
  reenrichSource,
  saveNote,
  setReadStatus,
  snoozeSource,
} from "@/server/sources/mutate";
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
  },
};

function sourceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "src1",
    triage_status: "needs_review",
    category_id: "cat_ai",
    category_source: "ai",
    category_confidence: 0.6,
    info_type: "idea",
    info_type_source: "ai",
    snoozed_until: null,
    read_status: "unread",
    user_note: null,
    category_candidates_json: JSON.stringify([
      { category_id: "cat_thought", confidence: 0.4 },
    ]),
    post_text: "本文",
    article_title: "記事",
    ...overrides,
  };
}

function sqlOf(call: unknown): string {
  if (typeof call === "string") {
    return call;
  }
  if (call && typeof call === "object" && "sql" in call) {
    return String((call as { sql: string }).sql);
  }
  return "";
}

beforeEach(() => {
  execute.mockReset();
  enqueueEnrichBatch.mockClear();
  execute.mockImplementation(async (query: unknown) => {
    const sql = sqlOf(query);
    if (sql.includes("FROM sources s") && sql.includes("LEFT JOIN x_posts")) {
      return { rows: [sourceRow()] };
    }
    if (sql.includes("FROM categories")) {
      return { rows: [{ id: "cat_ai" }, { id: "cat_thought" }] };
    }
    if (sql.includes("FROM source_tags")) {
      return { rows: [{ name: "llm" }] };
    }
    return { rows: [] };
  });
});

describe("confirmSource", () => {
  it("confirms with the requested category and records feedback", async () => {
    const result = await confirmSource("src1", ctx, {
      categoryId: "cat_thought",
    });
    expect(result.id).toBe("src1");
    expect(result.snapshot.categoryId).toBe("cat_ai");
    const sqls = execute.mock.calls.map((call) => sqlOf(call[0]));
    expect(
      sqls.some((sql) => sql.includes("triage_status = 'confirmed'")),
    ).toBe(true);
    expect(
      sqls.some((sql) => sql.includes("INSERT INTO feedback_examples")),
    ).toBe(true);
    const feedback = execute.mock.calls.find((call) =>
      sqlOf(call[0]).includes("INSERT INTO feedback_examples"),
    );
    expect(feedback?.[0]).toMatchObject({
      args: [
        "fb_test",
        "src1",
        "category_id",
        "記事\n本文",
        JSON.stringify("cat_ai"),
        JSON.stringify("cat_thought"),
      ],
    });
  });

  it("keeps the current category without feedback when unchanged", async () => {
    await confirmSource("src1", ctx);
    const sqls = execute.mock.calls.map((call) => sqlOf(call[0]));
    expect(
      sqls.some((sql) => sql.includes("INSERT INTO feedback_examples")),
    ).toBe(false);
  });
});

describe("inbox mutations", () => {
  it("archives, snoozes, notes, read status, and reenrich", async () => {
    const archived = await archiveSource("src1", ctx);
    expect(archived.snapshot.triageStatus).toBe("needs_review");
    expect(
      execute.mock.calls.some((call) =>
        sqlOf(call[0]).includes("triage_status = 'archived'"),
      ),
    ).toBe(true);

    const snoozed = await snoozeSource("src1", ctx);
    expect(snoozed.until).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    await saveNote("src1", ctx, "自分のメモ");
    expect(
      execute.mock.calls.some((call) => {
        const query = call[0] as { sql?: string; args?: unknown[] };
        return (
          typeof query === "object" &&
          query.sql?.includes("user_note = ?") &&
          query.args?.[0] === "自分のメモ"
        );
      }),
    ).toBe(true);

    const read = await setReadStatus("src1", ctx, "to_practice");
    expect(read.status).toBe("to_practice");

    await reenrichSource("src1", ctx);
    expect(
      execute.mock.calls.some((call) =>
        sqlOf(call[0]).includes("needs_reenrich = 1"),
      ),
    ).toBe(true);
    expect(enqueueEnrichBatch).toHaveBeenCalledOnce();
  });
});
