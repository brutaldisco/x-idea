import { getClient, isDbConfigured } from "@/db/client";
import { newId } from "@/lib/ids";
import { logger } from "@/lib/logger";
import type { TokenResponse, XMe } from "@/server/x/oauth";

export async function saveXAccount(
  me: XMe,
  tokens: TokenResponse,
): Promise<void> {
  const expires = new Date(
    Date.now() + (tokens.expires_in ?? 7200) * 1000,
  ).toISOString();
  const client = getClient();
  await client.execute("DELETE FROM x_account");
  await client.execute({
    sql: `INSERT INTO x_account (
      id, x_user_id, x_username, x_name, x_avatar_url,
      access_token, refresh_token, token_expires_at, scopes_json, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))`,
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
}

export async function deleteXAccount(): Promise<void> {
  await getClient().execute("DELETE FROM x_account");
  logger.info("x_account deleted");
}

export async function getXAccountPublic(): Promise<{
  username: string;
  name: string | null;
  status: string;
} | null> {
  if (!isDbConfigured()) {
    return null;
  }
  const result = await getClient().execute(
    "SELECT x_username, x_name, status FROM x_account LIMIT 1",
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    username: String(row.x_username),
    name: row.x_name ? String(row.x_name) : null,
    status: String(row.status),
  };
}
