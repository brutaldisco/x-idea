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

  logger.info({ applied, skipped, remote }, "migration applied");
  return { applied, skipped };
}
