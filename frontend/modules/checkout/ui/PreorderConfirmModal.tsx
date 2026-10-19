"use client";

import { AlertCircle, Calendar, Sparkles, X } from "lucide-react";
import type { CartItem } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { Modal } from "@/design-system/ui/Modal";
import { Button } from "@/design-system/ui/Button";

interface PreorderConfirmModalProps {
  open: boolean;
  items: CartItem[];
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** The last step before a pre-order is placed: what is being ordered, when it may arrive, and that it ships later. */
export function PreorderConfirmModal({ open, items, submitting, onClose, onConfirm }: PreorderConfirmModalProps) {
  const { t, ui, money, n } = useLang();
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  return (
    <Modal open={open} onClose={submitting ? () => {} : onClose} label={ui("close")}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-preorder-confirm-title"
        className="relative z-10 w-full max-w-md translate-y-4 scale-95 rounded-2xl border border-ink-200 bg-canvas p-6 opacity-0 shadow-2xl transition duration-200 ease-out group-data-[shown=true]:translate-y-0 group-data-[shown=true]:scale-100 group-data-[shown=true]:opacity-100"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="absolute right-4 top-4 rounded-full p-1.5 text-fg-muted transition-colors hover:bg-surface-muted hover:text-ink-700 disabled:opacity-40"
          aria-label={ui("close")}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-500/20 text-gold-700">
            <Sparkles className="h-4 w-4" />
          </span>
          <h3 id="checkout-preorder-confirm-title" className="text-base font-bold text-ink-950 sm:text-lg">
            {ui("confirmPreOrder")}
          </h3>
        </div>

        <ul className="mt-4 max-h-56 space-y-2.5 overflow-y-auto rounded-xl border border-gold-200/70 bg-gold-50/50 p-3.5 text-xs">
          {items.map(({ product, quantity, variantTitle, variantId }) => (
            <li key={variantId} className="space-y-0.5">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 font-semibold text-fg">
                  {t(product.name)}
                  {variantTitle && <span className="font-normal text-fg-subtle"> · {variantTitle}</span>}
                  <span className="font-normal text-fg-muted"> × {n(quantity)}</span>
                </span>
                <span className="shrink-0 font-bold text-ink-950">{money(product.price * quantity)}</span>
              </div>
              <div className="flex items-center gap-1 text-2xs font-medium text-gold-800">
                <Calendar className="h-3 w-3 shrink-0" />
                <span>
                  {ui("expectedDelivery")}:{" "}
                  {product.expectedDelivery ? t(product.expectedDelivery) : ui("deliveryDateTbc")}
                </span>
              </div>
            </li>
          ))}
          <li className="flex items-center justify-between border-t border-gold-200/60 pt-2 font-bold text-ink-950">
            <span>{ui("cartSubtotal")}</span>
            <span>{money(subtotal)}</span>
          </li>
        </ul>

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-surface p-3 text-xs leading-relaxed text-fg-muted">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" />
          <p>{ui("confirmPreOrderNotice")}</p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {ui("cancel")}
          </Button>
          <Button onClick={onConfirm} loading={submitting}>
            {submitting ? ui("checkoutPlacing") : ui("confirmPreOrderBtn")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
