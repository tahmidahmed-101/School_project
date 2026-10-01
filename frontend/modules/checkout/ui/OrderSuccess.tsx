"use client";

import Link from "next/link";
import { CheckCircle2, Phone, MessageSquare, Sparkles } from "lucide-react";
import { useBrand } from "@/modules/catalog";
import { useLang } from "@/lib/i18n";
import type { OrderResult } from "@/lib/types";
import { buttonClass } from "@/design-system/ui/Button";
import { Container } from "@/design-system/ui/Container";
import { PAGE_TITLE_CLASS } from "@/design-system/ui/PageHeader";

interface OrderSuccessProps {
  orderResult: OrderResult;
}

export function OrderSuccess({ orderResult }: OrderSuccessProps) {
  const { ui, money, n } = useLang();
  const BRAND_INFO = useBrand();

  const hasPreOrder = orderResult.lines.some((line) => line.isPreOrder);

  const whatsappText = encodeURIComponent(
    `Hello Kull Mart, I just placed order #${orderResult.orderNumber} for ${orderResult.lines.length} items (Total: ৳${orderResult.total}). Name: ${orderResult.customerName}, Phone: ${orderResult.phone}`,
  );

  return (
    <div className="min-h-screen bg-white py-12 sm:py-20">
      <Container width="compact" className="space-y-6 text-center">
        <div className="shadow-xs mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-brand-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className={PAGE_TITLE_CLASS}>{ui("orderSuccessTitle")}</h1>
          <p className="text-xs text-ink-600 sm:text-sm">{ui("orderSuccessSubtitle")}</p>
        </div>

        {hasPreOrder && (
          <div className="rounded-2xl border border-gold-300 bg-gold-50/90 p-4 text-left text-xs text-gold-950 shadow-2xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-gold-900">
              <Sparkles className="h-4 w-4 text-gold-700" />
              <span>{ui("checkoutPreOrderNotice")}</span>
            </div>
            <p className="text-2xs leading-relaxed text-gold-800">{ui("checkoutPreOrderShipping")}</p>
          </div>
        )}

        <div className="shadow-xs space-y-3 rounded-2xl border border-ink-200 bg-ink-50 p-5 text-left text-xs">
          <div className="flex justify-between border-b border-ink-200 pb-2">
            <span className="text-ink-500">{ui("orderNumberLabel")}</span>
            <span className="font-mono text-sm font-bold text-gold-800">{orderResult.orderNumber}</span>
          </div>
          <div className="space-y-1.5 border-b border-ink-200 pb-2">
            {orderResult.lines.map((line) => (
              <div key={line.id} className="flex justify-between gap-3 text-ink-600">
                <span className="min-w-0 truncate">
                  {line.name} × {n(line.quantity)}
                </span>
                <span className="shrink-0 font-semibold text-ink-800">{money(line.total)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 border-b border-ink-200 pb-2 text-ink-600">
            <div className="flex justify-between">
              <span>{ui("checkoutItemsTotal")}</span>
              <span className="font-semibold text-ink-800">{money(orderResult.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>{ui("checkoutShippingFee")}</span>
              <span className="font-semibold text-ink-800">
                {orderResult.shipping === 0 ? ui("cartDeliveryFree") : money(orderResult.shipping)}
              </span>
            </div>
            {orderResult.tax > 0 && (
              <div className="flex justify-between">
                <span>{ui("checkoutTax")}</span>
                <span className="font-semibold text-ink-800">{money(orderResult.tax)}</span>
              </div>
            )}
            {orderResult.discount > 0 && (
              <div className="flex justify-between">
                <span>{ui("checkoutDiscount")}</span>
                <span className="font-semibold text-brand-700">−{money(orderResult.discount)}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between border-b border-ink-200 pb-2">
            <span className="text-ink-500">{ui("checkoutGrandTotal")}</span>
            <span className="font-bold text-ink-900">{money(orderResult.total)}</span>
          </div>
          <div className="space-y-0.5 pt-1 text-ink-600">
            <span className="block font-semibold text-ink-900">
              {orderResult.customerName} ({orderResult.phone})
            </span>
            <span className="block text-ink-600">
              {orderResult.address}, {orderResult.district}
            </span>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <a
            href={`https://wa.me/${BRAND_INFO.whatsapp}?text=${whatsappText}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass({ variant: "secondary", fullWidth: true })}
          >
            <MessageSquare className="h-4 w-4" />
            <span>{ui("orderWhatsappConfirm")}</span>
          </a>
          <a href={`tel:${BRAND_INFO.phone}`} className={buttonClass({ variant: "outline", fullWidth: true })}>
            <Phone className="h-4 w-4 text-gold-500" />
            <span>
              {ui("orderCallStore")} ({BRAND_INFO.phone})
            </span>
          </a>
          <Link href="/" className="inline-block pt-2 text-xs font-bold text-gold-800 hover:text-gold-900">
            {ui("orderContinueShopping")}
          </Link>
        </div>
      </Container>
    </div>
  );
}
