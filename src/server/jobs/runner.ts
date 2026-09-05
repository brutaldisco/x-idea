import { logger } from "@/lib/logger";
import { isLaneBudgetError, laneRetryAt } from "@/server/ai/budget";
import { runHandler } from "@/server/jobs/handlers";
import {
  deferJob,
  dequeueJob,
  markJobDone,
  markJobFailed,
} from "@/server/jobs/queue";

const TICK_BUDGET_MS = 240_000;
const DEFAULT_MAX = 5;
const ENRICH_CAP = 2;

export async function runJobs(options?: {
  max?: number;
}): Promise<{ ran: number; failed: number }> {
  const max = options?.max ?? DEFAULT_MAX;
  const started = Date.now();
  let ran = 0;
  let failed = 0;
  let enrich = 0;

  while (ran < max && Date.now() - started < TICK_BUDGET_MS) {
    const job = await dequeueJob();
    if (!job) {
      break;
    }
    if (job.type === "enrich_batch") {
      if (enrich >= ENRICH_CAP) {
        await markJobFailed(
          job,
          new Error("enrich_batch cap this tick"),
          false,
        );
        continue;
      }
      enrich += 1;
    }
    try {
      await runHandler(job);
      await markJobDone(job.id);
      ran += 1;
    } catch (error) {
      if (isLaneBudgetError(error)) {
        const until = laneRetryAt(error);
        const jitterMs = Math.floor(Math.random() * 30_000);
        await deferJob(job, new Date(until.getTime() + jitterMs), error);
        continue;
      }
      failed += 1;
      await markJobFailed(job, error);
    }
  }

  logger.info({ ran, failed }, "runJobs finished");
  return { ran, failed };
}
