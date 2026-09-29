"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

interface AccordionItemProps {
  title: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** One collapsible row. Each row keeps its own open state, so several can be open at once. */
export function AccordionItem({ title, defaultOpen = false, children }: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="py-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between text-left"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-fg transition-colors group-hover:text-gold-600">
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-fg-subtle transition-transform duration-300 ${open ? "rotate-180 text-fg" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
