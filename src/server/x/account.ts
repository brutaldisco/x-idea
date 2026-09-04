import { getClient, isDbConfigured } from "@/db/client";
import { ensureSchema } from "@/db/ensure";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import type { TokenResponse, XMe } from "@/server/x/oauth";

export const MAX_X_ACCOUNTS = 3;

export type XAccountPublic = {
  id: string;
  username: string;
  name: string | null;
  status: string;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
};

export type XAccountSecret = XAccountPublic & {
  xUserId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
  lastSyncHeadTweetId: string | null;
};

export async function countXAccounts(): Promise<number> {
  if (!isDbConfigured()) {
    return 0;
  }
  const result = await getClient().execute(
    "SELECT COUNT(*) AS n FROM x_account LIMIT 1",
  );
  return Number(result.rows[0]?.n ?? 0);
}

export async function isLinkedUsername(hint: string): Promise<boolean> {
  const accounts = await listXAccounts();
  const needle = hint.replace(/^@+/, "").toLowerCase();
  return accounts.some((account) => account.username.toLowerCase() === needle);
}

export async function saveXAccount(
  me: XMe,
  tokens: TokenResponse,
): Promise<{ created: boolean }> {
  const expires = new Date(
    Date.now() + (tokens.expires_in ?? 7200) * 1000,
  ).toISOString();
  const client = getClient();

  const existing = await client.execute({
    sql: "SELECT id FROM x_account WHERE x_user_id = ? LIMIT 1",
    args: [me.id],
  });

  if (existing.rows[0]) {
    await client.execute({
      sql: `UPDATE x_account SET
        x_username = ?, x_name = ?, x_avatar_url = ?,
        access_token = ?, refresh_token = ?, token_expires_at = ?,
        scopes_json = ?, status = 'active', updated_at = datetime('now')
      WHERE id = ?`,
      args: [
        me.username,
        me.name ?? null,
        me.profile_image_url ?? null,
        tokens.access_token,
        tokens.refresh_token ?? "",
        expires,
        JSON.stringify(
          (
            tokens.scope ?? "bookmark.read tweet.read users.read offline.access"
          ).split(" "),
        ),
        existing.rows[0].id,
      ],
    });
    logger.info({ username: me.username }, "x_account updated");
    return { created: false };
  }

  const count = await countXAccounts();
  if (count >= MAX_X_ACCOUNTS) {
    throw new Error(`X アカウントは最大 ${MAX_X_ACCOUNTS} 件までです`);
  }

  await client.execute({
    sql: `INSERT INTO x_account (
      id, x_user_id, x_username, x_name, x_avatar_url,
      access_token, refresh_token, token_expires_at, scopes_json, status,
      sync_enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, datetime('now'), datetime('now'))`,
    args: [
      newId(),
      me.id,
      me.username,
      me.name ?? null,
      me.profile_image_url ?? null,
      tokens.access_token,
      tokens.refresh_token ?? "",
      expires,
      JSON.stringify(
        (
          tokens.scope ?? "bookmark.read tweet.read users.read offline.access"
        ).split(" "),
      ),
    ],
  });
  logger.info({ username: me.username }, "x_account saved");
  return { created: true };
}

export async function setXAccountSyncEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  await getClient().execute({
    sql: "UPDATE x_account SET sync_enabled = ?, updated_at = datetime('now') WHERE id = ?",
    args: [enabled ? 1 : 0, id],
  });
  logger.info({ id, enabled }, "x_account sync_enabled updated");
}

export async function countSyncEnabledAccounts(): Promise<number> {
  if (!isDbConfigured()) {
    return 0;
  }
  const result = await getClient().execute(
    "SELECT COUNT(*) AS n FROM x_account WHERE sync_enabled = 1 LIMIT 1",
  );
  return Number(result.rows[0]?.n ?? 0);
}

export async function deleteXAccount(id: string): Promise<void> {
  await getClient().execute({
    sql: "DELETE FROM x_account WHERE id = ?",
    args: [id],
  });
  logger.info({ id }, "x_account deleted");
}

export async function listXAccounts(): Promise<XAccountPublic[]> {
  if (!isDbConfigured()) {
    return [];
  }
  await ensureSchema();
  const result = await getClient().execute(
    `SELECT id, x_username, x_name, status, sync_enabled, last_synced_at
     FROM x_account ORDER BY created_at ASC LIMIT ${MAX_X_ACCOUNTS}`,
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    username: String(row.x_username),
    name: row.x_name ? String(row.x_name) : null,
    status: String(row.status),
    syncEnabled: Number(row.sync_enabled) === 1,
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
  }));
}

export async function getXAccountPublic(): Promise<XAccountPublic | null> {
  const list = await listXAccounts();
  return list[0] ?? null;
}

function asSecret(row: Record<string, unknown>): XAccountSecret {
  return {
    id: String(row.id),
    xUserId: String(row.x_user_id),
    username: String(row.x_username),
    name: row.x_name ? String(row.x_name) : null,
    status: String(row.status),
    syncEnabled: Number(row.sync_enabled) === 1,
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    accessToken: String(row.access_token),
    refreshToken: String(row.refresh_token ?? ""),
    tokenExpiresAt: String(row.token_expires_at),
    lastSyncHeadTweetId: row.last_sync_head_tweet_id
      ? String(row.last_sync_head_tweet_id)
      : null,
  };
}

const SECRET_COLUMNS = `id, x_user_id, x_username, x_name, status, sync_enabled,
  last_synced_at, access_token, refresh_token, token_expires_at,
  last_sync_head_tweet_id`;

export async function getXAccountSecret(
  id: string,
): Promise<XAccountSecret | null> {
  if (!isDbConfigured()) {
    return null;
  }
  await ensureSchema();
  const result = await getClient().execute({
    sql: `SELECT ${SECRET_COLUMNS} FROM x_account WHERE id = ? LIMIT 1`,
    args: [id],
  });
  const row = result.rows[0];
  return row ? asSecret(row as Record<string, unknown>) : null;
}

export async function listSyncableAccounts(): Promise<XAccountSecret[]> {
  if (!isDbConfigured()) {
    return [];
  }
  await ensureSchema();
  const result = await getClient().execute(
    `SELECT ${SECRET_COLUMNS} FROM x_account
     WHERE sync_enabled = 1 AND status = 'active'
     ORDER BY created_at ASC
     LIMIT ${MAX_X_ACCOUNTS}`,
  );
  return result.rows.map((row) => asSecret(row as Record<string, unknown>));
}

export async function updateXAccountTokens(
  id: string,
  tokens: TokenResponse,
): Promise<void> {
  const expires = new Date(
    Date.now() + (tokens.expires_in ?? 7200) * 1000,
  ).toISOString();
  await getClient().execute({
    sql: `UPDATE x_account SET
      access_token = ?,
      refresh_token = COALESCE(?, refresh_token),
      token_expires_at = ?,
      status = 'active',
      updated_at = datetime('now')
    WHERE id = ?`,
    args: [tokens.access_token, tokens.refresh_token ?? null, expires, id],
  });
}

export async function markXAccountReauth(id: string): Promise<void> {
  await getClient().execute({
    sql: "UPDATE x_account SET status = 'reauth_required', updated_at = datetime('now') WHERE id = ?",
    args: [id],
  });
  logger.warn({ id }, "x_account reauth_required");
}

export async function markXAccountSynced(
  id: string,
  headTweetId: string | null,
): Promise<void> {
  await getClient().execute({
    sql: `UPDATE x_account SET
      last_sync_head_tweet_id = COALESCE(?, last_sync_head_tweet_id),
      last_synced_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?`,
    args: [headTweetId, id],
  });
}
