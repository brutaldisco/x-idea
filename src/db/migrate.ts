import { getClient, isRemoteDb } from "@/db/client";
import {
  isIdempotentSkip,
  isOptionalStatement,
  loadInitSql,
  splitSql,
  toLocalSqlite,
} from "@/db/sql";
import { logger } from "@/lib/logger";

export async function applyMigration(): Promise<{
  applied: number;
  skipped: number;
}> {
  const client = getClient();
  const remote = isRemoteDb();
  const statements = splitSql(loadInitSql());
  let applied = 0;
  let skipped = 0;

  await client.execute("PRAGMA foreign_keys = ON");

  for (const raw of statements) {
    if (raw === "PRAGMA foreign_keys = ON") {
      continue;
    }
    const sql = remote ? raw : toLocalSqlite(raw);
    try {
      await client.execute(sql);
      applied += 1;
    } catch (error) {
      if (isOptionalStatement(raw) || isIdempotentSkip(error)) {
        skipped += 1;
        logger.warn(
          { sql: raw.slice(0, 80) },
          "optional migration statement skipped",
        );
        continue;
      }
      throw error;
    }
  }

  await applyOneShotPatches();
  logger.info({ applied, skipped, remote }, "migration applied");
  return { applied, skipped };
}

/** 再実行してもユーザーが ON にした値を消さない。 */
async function applyOneShotPatches(): Promise<void> {
  const client = getClient();
  await client.execute(`CREATE TABLE IF NOT EXISTS schema_patches (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const done = await client.execute(
    "SELECT id FROM schema_patches WHERE id = 'sync_enabled_default_off' LIMIT 1",
  );
  if (done.rows[0]) {
    return;
  }
  await client.execute("UPDATE x_account SET sync_enabled = 0");
  await client.execute({
    sql: "INSERT INTO schema_patches (id, applied_at) VALUES (?, datetime('now'))",
    args: ["sync_enabled_default_off"],
  });
  logger.info("patched x_account.sync_enabled default off");
}
