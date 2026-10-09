"use client";

import { Truck } from "lucide-react";
import { useLang } from "@/lib/i18n";
import type { FreeDeliveryStatus } from "@/lib/free-delivery";

/** One line under the cart and checkout totals: how far the basket is from free delivery, or that it has it. */
export function FreeDeliveryNote({ status }: { status: FreeDeliveryStatus | null }) {
  const { ui, money } = useLang();
  if (!status) return null;
  return (
    <p
      className={`flex items-center gap-1.5 text-2xs font-semibold ${status.reached ? "text-success" : "text-fg-muted"}`}
    >
      <Truck className="h-3.5 w-3.5 shrink-0" />
      <span>
        {status.reached
          ? ui("freeDeliveryReached")
          : ui("freeDeliveryAddMore").replace("{amount}", money(Number(status.remaining)))}
      </span>
    </p>
  );
}
