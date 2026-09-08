import { connection } from "next/server";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { ensureSchema } from "@/db/ensure";
import { listXAccounts } from "@/server/x/account";
import { getAccountContext } from "@/server/x/context";

export async function AccountChrome() {
  await connection();
  await ensureSchema();
  const [accounts, ctx] = await Promise.all([
    listXAccounts(),
    getAccountContext(),
  ]);
  const currentId = ctx.kind === "account" ? ctx.account.id : null;
  return <AccountSwitcher accounts={accounts} currentId={currentId} />;
}
