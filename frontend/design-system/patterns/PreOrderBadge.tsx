"use client";

import React from "react";
import { Clock, AlertCircle } from "lucide-react";
import { useLang } from "@/lib/i18n";

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
        className={`inline-flex items-center gap-1 rounded-full border border-ink-300 bg-surface-muted font-bold uppercase tracking-wider text-ink-700 shadow-2xs ${
          size === "sm" ? "px-1.5 py-0.5 text-2xs" : size === "md" ? "px-2.5 py-1 text-2xs" : "px-3 py-1.5 text-xs"
        } ${className}`}
      >
        {showIcon && <AlertCircle className="h-3 w-3 shrink-0 text-fg-subtle" />}
        <span>{ui("preOrderSoldOut")}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-gold-400/90 bg-accent font-bold uppercase tracking-wider text-ink-950 shadow-2xs ${
        size === "sm" ? "px-1.5 py-0.5 text-2xs" : size === "md" ? "px-2.5 py-1 text-2xs" : "px-3 py-1.5 text-xs"
      } ${className}`}
    >
      {showIcon && <Clock className="h-3 w-3 shrink-0 text-ink-950" />}
      <span>{ui(status === "closing-soon" ? "preOrderClosingSoon" : "preOrderBadge")}</span>
    </span>
  );
}
