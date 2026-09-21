"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { BottomDock, DockProvider } from "@/components/BottomDock";
import { InstallHint } from "@/components/pwa/InstallHint";
import { TabBar } from "@/components/TabBar";
import { TickOnMount } from "@/components/TickOnMount";
import {
  getLibraryGridWideServerSnapshot,
  getLibraryWideServerSnapshot,
  libraryShellMaxWidthClass,
  readLibraryGridWide,
  readLibraryWide,
  subscribeLibraryGridWide,
  subscribeLibraryWide,
  wideGridShellActive,
} from "@/lib/library-layout";
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
  const libraryWide = useSyncExternalStore(
    subscribeLibraryWide,
    readLibraryWide,
    getLibraryWideServerSnapshot,
  );
  const libraryGridWide = useSyncExternalStore(
    subscribeLibraryGridWide,
    readLibraryGridWide,
    getLibraryGridWideServerSnapshot,
  );
  const wideGridActive = wideGridShellActive({
    wideEnabled: libraryWide,
    onLibraryGrid: libraryGridWide,
    onVideos: pathname.startsWith("/videos"),
  });
  const shellClass = libraryShellMaxWidthClass({
    readerOpen,
    wideProp: wide,
    wideGridActive,
  });

  return (
    <DockProvider>
      <div className={`mx-auto min-h-dvh ${shellClass}`}>
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
