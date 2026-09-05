import { isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { enqueueEnrichIfPending } from "@/server/jobs/enrich";
import { reclaimZombies } from "@/server/jobs/queue";
import { runJobs } from "@/server/jobs/runner";
import { evaluateSchedules } from "@/server/jobs/schedule";
import type { TickSource } from "@/server/jobs/types";

export async function runTick(source: TickSource): Promise<{
  ok: true;
  source: TickSource;
  reclaimed: number;
  scheduled: string[];
  ran: number;
  failed: number;
}> {
  if (!isDbConfigured()) {
    return { ok: true, source, reclaimed: 0, scheduled: [], ran: 0, failed: 0 };
  }
  await ensureSchema();
  const reclaimed = await reclaimZombies();
  const scheduled = await evaluateSchedules();
  await enqueueEnrichIfPending();
  const { ran, failed } = await runJobs({ max: 5 });
  return { ok: true, source, reclaimed, scheduled, ran, failed };
}
