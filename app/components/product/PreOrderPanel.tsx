"use client";

import { Calendar, Clock } from "lucide-react";
import type { Product } from "../../lib/types";
import { useLang } from "../../lib/i18n";
import { PreOrderCountdown } from "../PreOrderCountdown";

interface PreOrderPanelProps {
  product: Product;
  isSoldOut: boolean;
}

/** Countdown, expected-delivery / closing dates and reservation progress for a pre-order. */
export function PreOrderPanel({ product, isSoldOut }: PreOrderPanelProps) {
  const { t, ui } = useLang();

  return (
    <div className="mt-5 space-y-3">
      {product.preorderEndDate && !isSoldOut && (
        <PreOrderCountdown endDate={product.preorderEndDate} />
      )}

      <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-gold-200/80 bg-gold-50/50 p-3.5 text-xs sm:grid-cols-2">
        <div className="flex items-start gap-2">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
          <div>
            <span className="block font-bold text-ink-900">
              {ui("expectedDelivery")}:
            </span>
            <span className="font-semibold text-gold-800">
              {product.expectedDelivery ? t(product.expectedDelivery) : "TBD"}
            </span>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
          <div>
            <span className="block font-bold text-ink-900">{ui("preOrderCloses")}:</span>
            <span className="text-ink-600">
              {product.preorderCloses ? t(product.preorderCloses) : "Limited quantity available"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
