import { type Client, createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";

export type Database = LibSQLDatabase<typeof schema>;

function databaseUrl(): string {
  return process.env.TURSO_DATABASE_URL ?? "file:local.db";
}

export function isRemoteDb(): boolean {
  const url = databaseUrl();
  return url.startsWith("libsql://") || url.startsWith("https://");
}

export function isDbConfigured(): boolean {
  if (!isRemoteDb()) {
    return true;
  }
  return Boolean(process.env.TURSO_AUTH_TOKEN);
}

let rawClient: Client | undefined;
let dbSingleton: Database | undefined;

export function getClient(): Client {
  if (rawClient) {
    return rawClient;
  }
  const url = databaseUrl();
  rawClient = createClient({
    url,
    authToken: isRemoteDb() ? process.env.TURSO_AUTH_TOKEN : undefined,
  });
  return rawClient;
}

export function getDb(): Database {
  if (dbSingleton) {
    return dbSingleton;
  }
  dbSingleton = drizzle(getClient(), { schema });
  return dbSingleton;
}

export async function pingDb(): Promise<boolean> {
  const result = await getClient().execute("SELECT 1 AS ok");
  return Number(result.rows[0]?.ok) === 1;
}
