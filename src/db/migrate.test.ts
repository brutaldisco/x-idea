import { describe, expect, it, vi } from "vitest";

const { client } = await vi.hoisted(async () => {
  const { createClient } = await import("@libsql/client");
  return { client: createClient({ url: ":memory:" }) };
});

vi.mock("@/db/client", () => ({
  getClient: () => client,
  isRemoteDb: () => false,
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { applyMigration } from "./migrate";

describe("applyMigration re-run safety", () => {
  it("keeps the first account's sync head across process restarts", async () => {
    await applyMigration();
    await client.execute(
      `INSERT INTO x_account (
         id, x_user_id, x_username, access_token, refresh_token,
         token_expires_at, scopes_json
       ) VALUES ('acc1', 'xu1', 'user1', 'a', 'r', '2030-01-01', '[]')`,
    );
    await client.execute("INSERT INTO settings (id) VALUES (1)");

    // 同期が成功すると head と last_synced_at が記録される
    await client.execute(
      `UPDATE x_account
       SET last_sync_head_tweet_id = 'tw1', last_synced_at = '2026-09-26 00:00:00'
       WHERE id = 'acc1'`,
    );

    // サーバーレスのコールドスタート相当: 全 SQL が再実行される
    await applyMigration();

    const result = await client.execute(
      `SELECT last_sync_head_tweet_id AS head, last_synced_at AS synced
       FROM x_account WHERE id = 'acc1'`,
    );
    expect(result.rows[0]?.head).toBe("tw1");
    expect(result.rows[0]?.synced).toBe("2026-09-26 00:00:00");
  });
});
