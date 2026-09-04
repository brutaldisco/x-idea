import { logger } from "@/lib/logger";
import type { JobRow } from "@/server/jobs/types";

export async function runHandler(job: JobRow): Promise<void> {
  logger.info({ jobId: job.id, type: job.type }, "job stub");
}
