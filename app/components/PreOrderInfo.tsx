"use client";

import React from "react";
import { Check, Calendar, Bell, Info } from "lucide-react";
import type { Product } from "../lib/types";
import { useLang } from "../lib/i18n";

interface PreOrderInfoProps {
  product: Product;
  className?: string;
}

export function PreOrderInfo({ product, className = "" }: PreOrderInfoProps) {
  const { ui, t } = useLang();

  const deliveryText = product.expectedDelivery
    ? t(product.expectedDelivery)
    : "October 5–10, 2026";

  const points = [
    {
      id: 1,
      icon: Check,
      text: ui("preOrderInfo1"),
    },
    {
      id: 2,
      icon: Calendar,
      text: `${ui("preOrderInfo2")}: ${deliveryText}`,
      highlight: true,
    },
    {
      id: 3,
      icon: Bell,
      text: ui("preOrderInfo3"),
    },
    {
      id: 4,
      icon: Info,
      text: ui("preOrderInfo4"),
    },
  ];

  return (
    <div
      className={`rounded-2xl border border-gold-200/80 bg-gradient-to-br from-gold-50/70 via-white to-gold-50/40 p-4 sm:p-5 shadow-2xs ${className}`}
    >
      <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-900">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold-500 text-[11px] font-extrabold text-ink-950 shadow-2xs">
          ✓
        </span>
        <span>{ui("preOrderInfoTitle")}</span>
      </h4>

      <ul className="space-y-2.5 text-xs text-ink-700">
        {points.map((pt) => {
          const Icon = pt.icon;
          return (
            <li key={pt.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">
                <Icon className="h-2.5 w-2.5" />
              </span>
              <span className={pt.highlight ? "font-semibold text-ink-950" : ""}>
                {pt.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
