"use client";

import type { ReactNode } from "react";
import { usePresence } from "./usePresence";

/** Height-animated disclosure panel; the grid-rows 0fr->1fr transition animates to the content's natural height. */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const { mounted, shown } = usePresence(open, 250);
  if (!mounted) return null;

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        shown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}
