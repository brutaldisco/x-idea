import type { ReactNode } from "react";
import { Suspense } from "react";
import { AccountChrome } from "@/components/AccountChrome";
import { AppChrome } from "@/components/AppChrome";

export default function TabsLayout({
  children,
  reader,
}: {
  children: ReactNode;
  reader: ReactNode;
}) {
  return (
    <AppChrome
      reader={reader}
      installHint
      account={
        <Suspense fallback={null}>
          <AccountChrome />
        </Suspense>
      }
    >
      {children}
    </AppChrome>
  );
}
