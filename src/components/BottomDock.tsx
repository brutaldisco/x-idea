"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";

const DockSlotContext = createContext<HTMLElement | null>(null);
const DockSlotSetterContext = createContext<
  ((node: HTMLElement | null) => void) | null
>(null);

export function DockProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <DockSlotSetterContext.Provider value={setSlot}>
      <DockSlotContext.Provider value={slot}>
        {children}
      </DockSlotContext.Provider>
    </DockSlotSetterContext.Provider>
  );
}

export function BottomDock({ children }: { children: ReactNode }) {
  const setSlot = useContext(DockSlotSetterContext);
  return (
    <div className="fixed inset-x-0 bottom-0 z-20">
      <div ref={setSlot} />
      {children}
    </div>
  );
}

export function DockExtra({ children }: { children: ReactNode }) {
  const slot = useContext(DockSlotContext);
  if (!slot) {
    return null;
  }
  return createPortal(children, slot);
}
