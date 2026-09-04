import { getClient } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { newId } from "@/lib/ids";

export type CreditKind = "topup" | "snapshot";

export async function addCreditEntry(
  kind: CreditKind,
  amountUsd: number,
  note?: string,
): Promise<void> {
  await ensureSchema();
  await getClient().execute({
    sql: `INSERT INTO x_credit_ledger (id, kind, amount_usd, note, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))`,
    args: [newId(), kind, amountUsd, note ?? null],
  });
}

export async function readLedger(): Promise<{
  purchasedUsd: number;
  snapshotRemainingUsd: number | null;
  snapshotAt: string | null;
}> {
  const client = getClient();
  const [topups, snapshot] = await Promise.all([
    client.execute(
      `SELECT COALESCE(SUM(amount_usd), 0) AS n
       FROM x_credit_ledger
       WHERE kind = 'topup'
       LIMIT 1`,
    ),
    client.execute(
      `SELECT amount_usd, created_at
       FROM x_credit_ledger
       WHERE kind = 'snapshot'
       ORDER BY created_at DESC
       LIMIT 1`,
    ),
  ]);
  const snap = snapshot.rows[0];
  return {
    purchasedUsd: Number(topups.rows[0]?.n ?? 0),
    snapshotRemainingUsd: snap ? Number(snap.amount_usd) : null,
    snapshotAt: snap ? String(snap.created_at) : null,
  };
}
