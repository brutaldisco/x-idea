import { cookies } from "next/headers";
import { listXAccounts, type XAccountPublic } from "@/server/x/account";
import { X_CTX_COOKIE } from "@/server/x/context-const";

export { X_CTX_COOKIE };

export type AccountContext =
  | { kind: "none" }
  | { kind: "account"; account: XAccountPublic };

export async function getAccountContext(): Promise<AccountContext> {
  const accounts = await listXAccounts();
  if (accounts.length === 0) {
    return { kind: "none" };
  }
  const jar = await cookies();
  const raw = jar.get(X_CTX_COOKIE)?.value;
  const found = accounts.find((account) => account.id === raw);
  return { kind: "account", account: found ?? accounts[0] };
}

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
