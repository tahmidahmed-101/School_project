"use client";

import Link from "next/link";
import { CheckCircle2, Sparkles } from "lucide-react";
import { ContactButtons } from "@/modules/catalog";
import { useLang } from "@/lib/i18n";
import type { OrderResult } from "@/lib/types";
import { Container } from "@/design-system/ui/Container";
import { PAGE_TITLE_CLASS } from "@/design-system/ui/PageHeader";
import { cardClass } from "@/design-system/ui/Card";

interface OrderSuccessProps {
  orderResult: OrderResult;
}

export function OrderSuccess({ orderResult }: OrderSuccessProps) {
  const { ui, money, n } = useLang();

  const hasPreOrder = orderResult.lines.some((line) => line.isPreOrder);

  const whatsappText = encodeURIComponent(
    `Hello Kull Mart, I just placed order #${orderResult.orderNumber} for ${orderResult.lines.length} items (Total: ৳${orderResult.total}). Name: ${orderResult.customerName}, Phone: ${orderResult.phone}`,
  );

  return (
    <div className="min-h-screen bg-canvas py-12 sm:py-20">
      <Container width="compact" className="space-y-6 text-center">
        <div className="shadow-xs mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-brand-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className={PAGE_TITLE_CLASS}>{ui("orderSuccessTitle")}</h1>
          <p className="text-xs text-fg-muted sm:text-sm">{ui("orderSuccessSubtitle")}</p>
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

        <div className={cardClass("surface", "shadow-xs space-y-3 p-5 text-left text-xs")}>
          <div className="flex justify-between border-b border-ink-200 pb-2">
            <span className="text-fg-subtle">{ui("orderNumberLabel")}</span>
            <span className="font-mono text-sm font-bold text-gold-800">{orderResult.orderNumber}</span>
          </div>
          <div className="space-y-1.5 border-b border-ink-200 pb-2">
            {orderResult.lines.map((line) => (
              <div key={line.id} className="flex justify-between gap-3 text-fg-muted">
                <span className="min-w-0 truncate">
                  {line.name} × {n(line.quantity)}
                </span>
                <span className="shrink-0 font-semibold text-ink-800">{money(line.total)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 border-b border-ink-200 pb-2 text-fg-muted">
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
            <span className="text-fg-subtle">{ui("checkoutGrandTotal")}</span>
            <span className="font-bold text-fg">{money(orderResult.total)}</span>
          </div>
          {orderResult.isPreOrderOrder && orderResult.depositDue > 0 && (
            <div className="flex justify-between border-b border-ink-200 pb-2">
              <span className="text-fg-subtle">{ui("checkoutDepositDue")}</span>
              <span className="font-bold text-fg">{money(orderResult.depositDue)}</span>
            </div>
          )}
          {orderResult.payTo && (
            <div className="flex justify-between gap-3 border-b border-ink-200 pb-2">
              <span className="text-fg-subtle">{ui("checkoutPayTo")}</span>
              <span className="font-bold text-fg">{orderResult.payTo}</span>
            </div>
          )}
          <div className="space-y-0.5 pt-1 text-fg-muted">
            <span className="block font-semibold text-fg">
              {orderResult.customerName} ({orderResult.phone})
            </span>
            <span className="block text-fg-muted">
              {orderResult.address}, {orderResult.district}
            </span>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <ContactButtons whatsappText={whatsappText} />
          <Link href="/" className="inline-block pt-2 text-xs font-bold text-gold-800 hover:text-gold-900">
            {ui("orderContinueShopping")}
          </Link>
        </div>
      </Container>
    </div>
  );
}
