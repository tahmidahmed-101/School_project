"use client";

import { useLang } from "@/lib/i18n";

const SIZES = {
  sm: "px-1.5 py-0.5 text-[9px]",
  md: "px-2 py-0.5 text-[10px] sm:text-xs",
} as const;

const TONES = {
  solid: "shadow-xs bg-danger text-white",
  soft: "bg-danger-surface text-danger",
} as const;

interface DiscountBadgeProps {
  percent: number;
  size?: keyof typeof SIZES;
  tone?: keyof typeof TONES;
  className?: string;
}

/** "N% off" label shared by product cards, list rows, the gallery and the price line. */
export function DiscountBadge({ percent, size = "sm", tone = "solid", className = "" }: DiscountBadgeProps) {
  const { ui, n } = useLang();
  return (
    <span className={`rounded-md font-bold tracking-wide ${SIZES[size]} ${TONES[tone]} ${className}`}>
      {n(percent)}% {ui("off")}
    </span>
  );
}
