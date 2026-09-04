import { getClient } from "@/db/client";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { JOB_PRIORITY, type JobRow } from "@/server/jobs/types";

function asJob(row: Record<string, unknown>): JobRow {
  return {
    id: Number(row.id),
    type: String(row.type),
    payload_json: String(row.payload_json ?? "{}"),
    dedupe_key: row.dedupe_key == null ? null : String(row.dedupe_key),
    status: String(row.status),
    priority: Number(row.priority),
    attempts: Number(row.attempts),
    max_attempts: Number(row.max_attempts),
    run_after: String(row.run_after),
    timeout_sec: Number(row.timeout_sec),
    locked_by: row.locked_by == null ? null : String(row.locked_by),
    started_at: row.started_at == null ? null : String(row.started_at),
    finished_at: row.finished_at == null ? null : String(row.finished_at),
    last_error: row.last_error == null ? null : String(row.last_error),
    created_at: String(row.created_at),
  };
}

export async function reclaimZombies(): Promise<number> {
  const result = await getClient().execute({
    sql: `UPDATE jobs
      SET status = 'pending', locked_by = NULL, started_at = NULL,
          last_error = 'zombie_reclaimed'
      WHERE status = 'running'
        AND started_at IS NOT NULL
        AND datetime(started_at, '+' || timeout_sec || ' seconds') < datetime('now')`,
  });
  return result.rowsAffected;
}

export async function enqueueJob(input: {
  type: string;
  payload?: unknown;
  dedupeKey?: string;
  priority?: number;
  timeoutSec?: number;
}): Promise<boolean> {
  const priority = input.priority ?? JOB_PRIORITY[input.type] ?? 0;
  try {
    await getClient().execute({
      sql: `INSERT INTO jobs (type, payload_json, dedupe_key, priority, status, timeout_sec, run_after, created_at)
            VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))`,
      args: [
        input.type,
        JSON.stringify(input.payload ?? {}),
        input.dedupeKey ?? null,
        priority,
        input.timeoutSec ?? 120,
      ],
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE") || message.includes("unique")) {
      return false;
    }
    throw error;
  }
}

export async function dequeueJob(
  workerId = `tick-${newId()}`,
): Promise<JobRow | null> {
  const result = await getClient().execute({
    sql: `UPDATE jobs
      SET status = 'running',
          started_at = datetime('now'),
          attempts = attempts + 1,
          locked_by = ?
      WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'pending' AND run_after <= datetime('now')
        ORDER BY priority DESC, created_at
        LIMIT 1
      )
      RETURNING *`,
    args: [workerId],
  });
  const row = result.rows[0];
  return row ? asJob(row as Record<string, unknown>) : null;
}

export async function markJobDone(id: number): Promise<void> {
  await getClient().execute({
    sql: `UPDATE jobs
      SET status = 'done', finished_at = datetime('now'), locked_by = NULL
      WHERE id = ?`,
    args: [id],
  });
}

export async function markJobFailed(
  job: JobRow,
  error: unknown,
  incrementAttempts = true,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const attempts = incrementAttempts
    ? job.attempts
    : Math.max(0, job.attempts - 1);
  const permanent = attempts >= job.max_attempts;
  const delayMin = Math.min(32, 2 ** Math.max(0, attempts - 1));
  await getClient().execute({
    sql: `UPDATE jobs
      SET status = ?,
          last_error = ?,
          attempts = ?,
          locked_by = NULL,
          started_at = NULL,
          finished_at = CASE WHEN ? THEN datetime('now') ELSE NULL END,
          run_after = datetime('now', ?)
      WHERE id = ?`,
    args: [
      permanent ? "failed_permanent" : "pending",
      message.slice(0, 500),
      attempts,
      permanent ? 1 : 0,
      `+${delayMin} minutes`,
      job.id,
    ],
  });
  logger.warn({ jobId: job.id, type: job.type, permanent }, "job failed");
}

export async function countJobsByStatus(): Promise<{
  pending: number;
  running: number;
  failed: number;
}> {
  const result = await getClient().execute(
    `SELECT status, COUNT(*) AS n FROM jobs
     WHERE status IN ('pending','running','failed','failed_permanent')
     GROUP BY status`,
  );
  const counts = { pending: 0, running: 0, failed: 0 };
  for (const row of result.rows) {
    const status = String(row.status);
    const n = Number(row.n);
    if (status === "pending") {
      counts.pending = n;
    } else if (status === "running") {
      counts.running = n;
    } else {
      counts.failed += n;
    }
  }
  return counts;
}
