import { getClient } from "@/db/client";
import { enqueueJob } from "@/server/jobs/queue";

export async function enqueueEnrichBatch(): Promise<boolean> {
  return enqueueJob({
    type: "enrich_batch",
    dedupeKey: "enrich_batch:open",
    timeoutSec: 120,
  });
}

export async function enqueueEnrichIfPending(): Promise<boolean> {
  const pending = await getClient().execute(
    `SELECT id FROM sources
     WHERE availability = 'available'
       AND (triage_status = 'pending' OR needs_reenrich = 1)
     ORDER BY saved_at DESC, id
     LIMIT 1`,
  );
  if (!pending.rows[0]) {
    return false;
  }
  return enqueueEnrichBatch();
}
