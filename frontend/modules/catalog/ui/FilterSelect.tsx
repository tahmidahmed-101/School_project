"use client";

import { useState, type ReactNode } from "react";
import { Collapse } from "@/design-system/patterns/Collapse";
import { Check, ChevronDown } from "lucide-react";

interface FilterSelectProps {
  icon: ReactNode;
  /** Text shown on the trigger for the current selection. */
  triggerLabel: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  defaultOpen?: boolean;
}

/** Sidebar filter: a trigger that expands an inline list of single-choice options. */
export function FilterSelect({ icon, triggerLabel, options, value, onChange, defaultOpen = false }: FilterSelectProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex w-full cursor-pointer items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-all ${
          isOpen
            ? "border-gold-500 bg-gold-50/60 ring-2 ring-gold-500/10"
            : "border-ink-200 bg-canvas hover:border-gold-500"
        }`}
        aria-expanded={isOpen}
      >
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate text-xs font-bold text-fg">{triggerLabel}</span>
        </div>

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <Collapse open={isOpen}>
        <div className="mt-2 space-y-1 rounded-xl border border-ink-200 bg-surface p-1.5 shadow-inner">
          {options.map((option) => {
            const isSelected = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange(option.id)}
                className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-all ${
                  isSelected
                    ? "shadow-xs bg-accent font-bold text-ink-950"
                    : "text-ink-700 hover:bg-canvas hover:text-ink-950"
                }`}
              >
                <span>{option.label}</span>
                {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-ink-950" />}
              </button>
            );
          })}
        </div>
      </Collapse>
    </div>
  );
}
