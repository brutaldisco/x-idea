"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BottomDock, DockProvider } from "@/components/BottomDock";
import { InstallHint } from "@/components/pwa/InstallHint";
import { TabBar } from "@/components/TabBar";
import { TickOnMount } from "@/components/TickOnMount";
import { isReaderSlotActive } from "@/lib/reader-slot";

export function AppChrome({
  children,
  reader,
  account,
  installHint = false,
  wide = false,
}: {
  children: ReactNode;
  reader?: ReactNode;
  account: ReactNode;
  installHint?: boolean;
  wide?: boolean;
}) {
  const pathname = usePathname();
  const readerOpen = Boolean(reader) && isReaderSlotActive(pathname);
  const useWide = wide || readerOpen;

  return (
    <DockProvider>
      <div
        className={`mx-auto min-h-dvh ${
          useWide
            ? "max-w-4xl pb-36 min-[48rem]:pb-32"
            : "max-w-3xl pb-32 min-[48rem]:pb-24"
        }`}
      >
        <TickOnMount />
        <div hidden={readerOpen}>{children}</div>
        {readerOpen ? reader : null}
        {account}
        {installHint ? <InstallHint /> : null}
        <BottomDock>
          <TabBar />
        </BottomDock>
      </div>
    </DockProvider>
  );
}
