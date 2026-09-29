"use client";

import { Minus, Plus } from "lucide-react";
import { useLang } from "@/lib/i18n";

interface QuantityStepperProps {
  quantity: number;
  onChange: (quantity: number) => void;
}

/** Compact − / count / + control shared by the cart drawer and the checkout summary. */
export function QuantityStepper({ quantity, onChange }: QuantityStepperProps) {
  const { n } = useLang();

  return (
    <div className="inline-flex items-center rounded-lg border border-ink-200 bg-white p-0.5">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        className="cursor-pointer p-1 text-ink-600 hover:text-ink-900"
        aria-label="Decrease quantity"
      >
        <Minus className="h-3 w-3" />
      </button>
      <span className="min-w-[20px] px-2 text-center text-xs font-bold text-ink-900">{n(quantity)}</span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        className="cursor-pointer p-1 text-ink-600 hover:text-ink-900"
        aria-label="Increase quantity"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
