"use client";

import { useState, type ReactNode } from "react";
import { Collapse } from "@/design-system/patterns/Collapse";
import { ChevronDown } from "lucide-react";

interface AccordionItemProps {
  title: ReactNode;
  /** Shown before the title. */
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Padding and text style shared by the content of every row. */
export const ACCORDION_BODY = "pb-3 pt-3 text-sm leading-relaxed text-fg-muted";

/** One collapsible row. Each row keeps its own open state, so several can be open at once. */
export function AccordionItem({ title, icon, defaultOpen = false, children }: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="py-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="group flex w-full cursor-pointer items-center justify-between text-left"
      >
        <span className="flex min-w-0 items-center gap-2.5 text-sm font-bold uppercase tracking-wider text-fg transition-colors group-hover:text-gold-800">
          {icon && <span className="shrink-0 text-gold-700">{icon}</span>}
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <Collapse open={open}>{children}</Collapse>
    </div>
  );
}
