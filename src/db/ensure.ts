import { isDbConfigured, pingDb } from "@/db/client";
import { applyMigration } from "@/db/migrate";
import { seed } from "@/db/seed";
import { logger } from "@/lib/logger";

let ready: Promise<void> | undefined;

export async function ensureSchema(): Promise<void> {
  if (!isDbConfigured()) {
    return;
  }
  if (!ready) {
    ready = (async () => {
      await pingDb();
      await applyMigration();
      await seed();
    })().catch((error: unknown) => {
      ready = undefined;
      logger.error({ err: error }, "ensureSchema failed");
      throw error;
    });
  }
  await ready;
}
