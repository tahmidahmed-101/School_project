"use client";

import { Minus, Plus } from "lucide-react";
import { useLang } from "@/lib/i18n";

interface QuantityStepperProps {
  quantity: number;
  onChange: (quantity: number) => void;
  /** "sm" for cart rows and the checkout summary, "lg" for the product page. */
  size?: "sm" | "lg";
  min?: number;
  max?: number;
}

const STYLES = {
  sm: {
    wrap: "rounded-lg p-0.5",
    // The pseudo-element stretches the tap target to 40px without making the stepper itself bigger.
    button: "h-8 w-8 rounded-md before:absolute before:-inset-1 before:content-['']",
    icon: "h-3.5 w-3.5",
    count: "min-w-[24px] px-1 text-xs",
  },
  lg: {
    wrap: "h-12 rounded-full bg-ink-50",
    button: "h-12 w-11 rounded-full",
    icon: "h-4 w-4",
    count: "w-10 text-sm",
  },
} as const;

/** − / count / + control shared by the cart drawer, checkout summary and product page. */
export function QuantityStepper({ quantity, onChange, size = "sm", min, max }: QuantityStepperProps) {
  const { n } = useLang();
  const s = STYLES[size];
  const atMin = min !== undefined && quantity <= min;
  const atMax = max !== undefined && quantity >= max;
  const buttonClass = `relative flex cursor-pointer items-center justify-center text-ink-600 transition-colors hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40 ${s.button}`;

  return (
    <div className={`inline-flex items-center border border-ink-200 bg-white ${s.wrap}`}>
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={atMin}
        className={buttonClass}
        aria-label="Decrease quantity"
      >
        <Minus className={s.icon} />
      </button>
      <span className={`text-center font-bold tabular-nums text-ink-900 ${s.count}`} aria-live="polite">
        {n(quantity)}
      </span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={atMax}
        className={buttonClass}
        aria-label="Increase quantity"
      >
        <Plus className={s.icon} />
      </button>
    </div>
  );
}
