"use client";

import React from "react";
import { Clock, AlertCircle } from "lucide-react";
import { useLang } from "../lib/i18n";

interface PreOrderBadgeProps {
  status?: "available" | "closing-soon" | "sold-out";
  size?: "sm" | "md" | "lg";
  className?: string;
  showIcon?: boolean;
}

export function PreOrderBadge({
  status = "available",
  size = "sm",
  className = "",
  showIcon = true,
}: PreOrderBadgeProps) {
  const { ui } = useLang();

  if (status === "sold-out") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md border border-ink-300 bg-ink-100 font-bold uppercase tracking-wider text-ink-700 shadow-2xs ${
          size === "sm"
            ? "px-1.5 py-0.5 text-[8.5px] sm:text-[9.5px]"
            : size === "md"
              ? "px-2.5 py-1 text-[11px]"
              : "px-3 py-1.5 text-xs"
        } ${className}`}
      >
        {showIcon && <AlertCircle className="h-3 w-3 shrink-0 text-ink-500" />}
        <span>{ui("preOrderSoldOut")}</span>
      </span>
    );
  }

  // Active / closing soon pre-orders just say "Closing soon"
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-gold-400/90 bg-gold-500 font-bold uppercase tracking-wider text-ink-950 shadow-2xs ${
        size === "sm"
          ? "px-1.5 py-0.5 text-[8.5px] sm:text-[9.5px]"
          : size === "md"
            ? "px-2.5 py-1 text-[11px]"
            : "px-3 py-1.5 text-xs"
      } ${className}`}
    >
      {showIcon && <Clock className="h-3 w-3 shrink-0 text-ink-950" />}
      <span>{ui("preOrderClosingSoon")}</span>
    </span>
  );
}
