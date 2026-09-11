import { cookies } from "next/headers";
import { cache } from "react";
import { getDefaultXAccountId } from "@/server/settings";
import { listXAccounts, type XAccountPublic } from "@/server/x/account";
import { X_CTX_COOKIE } from "@/server/x/context-const";

export { X_CTX_COOKIE };

export type AccountContext =
  | { kind: "none" }
  | { kind: "account"; account: XAccountPublic };

export function pickAccount(
  accounts: XAccountPublic[],
  cookieId: string | undefined,
  defaultId: string | null,
): AccountContext {
  if (accounts.length === 0) {
    return { kind: "none" };
  }
  const fromCookie = cookieId
    ? accounts.find((account) => account.id === cookieId)
    : undefined;
  if (fromCookie) {
    return { kind: "account", account: fromCookie };
  }
  const fromDefault = defaultId
    ? accounts.find((account) => account.id === defaultId)
    : undefined;
  if (fromDefault) {
    return { kind: "account", account: fromDefault };
  }
  return { kind: "account", account: accounts[0] };
}

export const getAccountContext = cache(
  async function getAccountContext(): Promise<AccountContext> {
    const [accounts, defaultId, jar] = await Promise.all([
      listXAccounts(),
      getDefaultXAccountId(),
      cookies(),
    ]);
    return pickAccount(accounts, jar.get(X_CTX_COOKIE)?.value, defaultId);
  },
);

export async function setAccountContext(value: string): Promise<void> {
  const accounts = await listXAccounts();
  if (!accounts.some((account) => account.id === value)) {
    return;
  }
  const jar = await cookies();
  jar.set(X_CTX_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** SQL の WHERE 句に使う x_account_id。未連携なら null。 */
export function contextAccountId(ctx: AccountContext): string | null {
  return ctx.kind === "account" ? ctx.account.id : null;
}

export function contextLabel(ctx: AccountContext): string {
  return ctx.kind === "account" ? `@${ctx.account.username}` : "未連携";
}
