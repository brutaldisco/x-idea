import { connection } from "next/server";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { TickOnMount } from "@/components/TickOnMount";
import { listXAccounts } from "@/server/x/account";
import { getAccountContext } from "@/server/x/context";

async function Switcher() {
  await connection();
  const [accounts, ctx] = await Promise.all([
    listXAccounts(),
    getAccountContext(),
  ]);
  const current = ctx.kind === "account" ? ctx.account.id : "all";
  return <AccountSwitcher accounts={accounts} current={current} />;
}

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-24">
      <TickOnMount />
      {children}
      <div className="fixed inset-x-0 bottom-14 z-10 mx-auto max-w-lg">
        <Suspense fallback={null}>
          <Switcher />
        </Suspense>
      </div>
    </div>
  );
}
