import { cookies } from "next/headers";
import { listXAccounts, type XAccountPublic } from "@/server/x/account";
import { ALL_CONTEXT, X_CTX_COOKIE } from "@/server/x/context-const";

export { ALL_CONTEXT, X_CTX_COOKIE };

export type AccountContext =
  | { kind: "all" }
  | { kind: "account"; account: XAccountPublic };

export async function getAccountContext(): Promise<AccountContext> {
  const jar = await cookies();
  const raw = jar.get(X_CTX_COOKIE)?.value;
  if (!raw || raw === ALL_CONTEXT) {
    return { kind: "all" };
  }
  const accounts = await listXAccounts();
  const found = accounts.find((a) => a.id === raw);
  return found ? { kind: "account", account: found } : { kind: "all" };
}

export async function setAccountContext(value: string): Promise<void> {
  const jar = await cookies();
  if (value === ALL_CONTEXT) {
    jar.set(X_CTX_COOKIE, ALL_CONTEXT, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return;
  }
  const accounts = await listXAccounts();
  if (!accounts.some((a) => a.id === value)) {
    return;
  }
  jar.set(X_CTX_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** SQL の WHERE 句に使う x_account_id フィルタを返す。all なら null。 */
export function contextAccountId(ctx: AccountContext): string | null {
  return ctx.kind === "account" ? ctx.account.id : null;
}

export function contextLabel(ctx: AccountContext): string {
  return ctx.kind === "account" ? `@${ctx.account.username}` : "すべて";
}
