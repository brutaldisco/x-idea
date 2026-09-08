import type { ReactNode } from "react";
import { Suspense } from "react";
import { AccountChrome } from "@/components/AccountChrome";
import { AppChrome } from "@/components/AppChrome";

export default function SourceLayout({ children }: { children: ReactNode }) {
  return (
    <AppChrome
      wide
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
