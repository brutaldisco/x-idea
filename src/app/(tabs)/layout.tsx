import type { ReactNode } from "react";
import { TickOnMount } from "@/components/TickOnMount";

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-24">
      <TickOnMount />
      {children}
    </div>
  );
}
