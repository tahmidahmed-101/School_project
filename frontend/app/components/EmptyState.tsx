"use client";

import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { useLang } from "../lib/i18n";
import { ScrollReveal } from "./Reveal";

interface EmptyStateProps {
  /** Pre-styled icon element (size/color are the caller's, since they differ per variant). */
  icon: ReactNode;
  title: string;
  onReset: () => void;
  /** "panel" is the larger card used on the shop page; "inline" is the compact dashed-border block. */
  variant?: "panel" | "inline";
}

/** "No results" state shared by every filterable product list. */
export function EmptyState({ icon, title, onReset, variant = "panel" }: EmptyStateProps) {
  const { ui } = useLang();

  if (variant === "inline") {
    return (
      <div className="rounded-2xl border border-dashed border-ink-200 py-12 text-center text-ink-500">
        {icon}
        <p className="mt-2 text-sm">{title}</p>
        <button
          type="button"
          onClick={onReset}
          className="mt-3 cursor-pointer text-xs font-bold text-gold-600 hover:underline"
        >
          {ui("resetFilters")}
        </button>
      </div>
    );
  }

  return (
    <ScrollReveal y={20} duration={0.6}>
      <div className="shadow-xs my-4 rounded-2xl border border-ink-200/80 bg-white p-12 text-center sm:p-16">
        {icon}
        <h4 className="ts-display mb-2 text-lg font-bold text-ink-900 sm:text-xl">{title}</h4>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-gold-500 px-7 py-3 text-xs font-bold tracking-wider text-ink-950 shadow-md transition-colors hover:bg-gold-400"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>{ui("resetFilters")}</span>
        </button>
      </div>
    </ScrollReveal>
  );
}
