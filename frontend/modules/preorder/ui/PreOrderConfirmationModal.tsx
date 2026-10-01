"use client";

import Image from "next/image";
import { X, Calendar, Sparkles, AlertCircle } from "lucide-react";
import { usePreOrderModal } from "../context";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { Modal } from "@/design-system/ui/Modal";
import { Button } from "@/design-system/ui/Button";

export function PreOrderConfirmationModal() {
  const { isOpen, product, quantity, selectedVariant, closePreOrderModal, confirmPreOrder } = usePreOrderModal();
  const { t, ui, money, n } = useLang();

  if (!product) return null;

  const deliveryDate = product.expectedDelivery ? t(product.expectedDelivery) : ui("deliveryDateTbc");

  return (
    <Modal open={isOpen} onClose={closePreOrderModal} label="Close modal">
      {/* Modal Dialog Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preorder-modal-title"
        className="relative z-10 w-full max-w-md translate-y-4 scale-95 rounded-2xl border border-ink-200 bg-white p-6 opacity-0 shadow-2xl transition duration-200 ease-out group-data-[shown=true]:translate-y-0 group-data-[shown=true]:scale-100 group-data-[shown=true]:opacity-100"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={closePreOrderModal}
          className="absolute right-4 top-4 rounded-full p-1.5 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-700"
          aria-label={ui("close")}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-500/20 text-gold-700">
            <Sparkles className="h-4 w-4" />
          </span>
          <h3 id="preorder-modal-title" className="text-base font-bold text-ink-950 sm:text-lg">
            {ui("confirmPreOrder")}
          </h3>
        </div>

        {/* Product Card Row */}
        <div className="mt-4 flex gap-3.5 rounded-xl border border-ink-200/80 bg-ink-50 p-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-white">
            <Image src={photo(product.image)} alt={t(product.name)} fill sizes="64px" className="object-cover" />
          </div>

          <div className="min-w-0 flex-1">
            <span className="inline-block rounded bg-gold-500/20 px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-gold-900">
              {ui("preOrderClosingSoon")}
            </span>
            <h4 className="line-clamp-1 text-xs font-bold text-ink-900">{t(product.name)}</h4>
            {selectedVariant && Object.keys(selectedVariant).length > 0 && (
              <p className="text-2xs text-ink-500">
                {Object.entries(selectedVariant)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ")}
              </p>
            )}
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="font-bold text-gold-800">
                {money(product.price)} {quantity > 1 ? `× ${n(quantity)}` : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Preorder Details Table */}
        <div className="mt-4 space-y-2.5 rounded-xl border border-gold-200/70 bg-gold-50/50 p-3.5 text-xs text-ink-700">
          <div className="flex items-center justify-between">
            <span className="font-medium text-ink-600">{ui("price")}</span>
            <span className="font-bold text-ink-950">{money(product.price * quantity)}</span>
          </div>

          <div className="flex items-center justify-between border-t border-gold-200/50 pt-2">
            <span className="flex items-center gap-1.5 font-medium text-ink-600">
              <Calendar className="h-3.5 w-3.5 text-gold-700" />
              <span>{ui("expectedDelivery")}</span>
            </span>
            <span className="font-bold text-ink-950">{deliveryDate}</span>
          </div>
        </div>

        {/* Disclaimer Notice */}
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-ink-50 p-3 text-xs leading-relaxed text-ink-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" />
          <p>{ui("confirmPreOrderNotice")}</p>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={closePreOrderModal}>
            {ui("cancel")}
          </Button>
          <Button onClick={confirmPreOrder}>{ui("confirmPreOrderBtn")}</Button>
        </div>
      </div>
    </Modal>
  );
}
