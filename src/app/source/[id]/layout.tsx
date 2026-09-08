import { connection } from "next/server";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { BottomDock, DockProvider } from "@/components/BottomDock";
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

export default function SourceLayout({ children }: { children: ReactNode }) {
  return (
    <DockProvider>
      <div className="mx-auto min-h-dvh max-w-4xl pb-36 min-[48rem]:pb-32">
        <TickOnMount />
        {children}
        <Suspense fallback={null}>
          <AccountChrome />
        </Suspense>
        <BottomDock>
          <TabBar />
        </BottomDock>
      </div>
    </DockProvider>
  );
}
