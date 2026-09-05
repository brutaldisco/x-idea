import { connection } from "next/server";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { InstallHint } from "@/components/pwa/InstallHint";
import { TabBar } from "@/components/TabBar";
import { TickOnMount } from "@/components/TickOnMount";
import { ensureSchema } from "@/db/ensure";
import { listXAccounts } from "@/server/x/account";
import { getAccountContext } from "@/server/x/context";

async function AccountChrome() {
  await connection();
  await ensureSchema();
  const [accounts, ctx] = await Promise.all([
    listXAccounts(),
    getAccountContext(),
  ]);
  const currentId = ctx.kind === "account" ? ctx.account.id : null;
  return <AccountSwitcher accounts={accounts} currentId={currentId} />;
}

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-3xl pb-32 min-[48rem]:pb-24">
      <TickOnMount />
      {children}
      <Suspense fallback={null}>
        <AccountChrome />
      </Suspense>
      <InstallHint />
      <TabBar />
    </div>
  );
}
