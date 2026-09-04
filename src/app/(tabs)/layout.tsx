import { connection } from "next/server";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { TabBar } from "@/components/TabBar";
import { TickOnMount } from "@/components/TickOnMount";
import { listXAccounts } from "@/server/x/account";
import { getAccountContext } from "@/server/x/context";

async function Footer() {
  await connection();
  const [accounts, ctx] = await Promise.all([
    listXAccounts(),
    getAccountContext(),
  ]);
  const currentId = ctx.kind === "account" ? ctx.account.id : null;
  return <TabBar accounts={accounts} currentId={currentId} />;
}

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-36">
      <TickOnMount />
      {children}
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </div>
  );
}
