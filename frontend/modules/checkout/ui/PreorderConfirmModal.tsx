"use client";

import { Sparkles, X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Modal } from "@/design-system/ui/Modal";
import { Button } from "@/design-system/ui/Button";

interface PreorderConfirmModalProps {
  open: boolean;
  /** The pre-order terms in the shopper's language; with them, confirming means accepting them. "" for none. */
  terms: string;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** The last step before a pre-order is placed: the pre-order terms staff wrote, which the shopper accepts to place it. */
export function PreorderConfirmModal({ open, terms, submitting, onClose, onConfirm }: PreorderConfirmModalProps) {
  const { ui } = useLang();

  return (
    <Modal open={open} onClose={submitting ? () => {} : onClose} label={ui("close")}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-preorder-confirm-title"
        className={`relative z-10 flex max-h-[90vh] w-full flex-col ${terms ? "max-w-lg" : "max-w-md"} translate-y-4 scale-95 rounded-2xl border border-ink-200 bg-canvas p-6 opacity-0 shadow-2xl transition duration-200 ease-out group-data-[shown=true]:translate-y-0 group-data-[shown=true]:scale-100 group-data-[shown=true]:opacity-100`}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="absolute right-4 top-4 cursor-pointer rounded-full p-1.5 text-fg-muted transition-colors hover:bg-surface-muted hover:text-ink-700 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={ui("close")}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-500/20 text-gold-700">
            <Sparkles className="h-4 w-4" />
          </span>
          <h3 id="checkout-preorder-confirm-title" className="text-base font-bold text-ink-950 sm:text-lg">
            {/* The window is the terms; without any it simply asks to confirm the pre-order. */}
            {terms ? ui("termsTitle") : ui("confirmPreOrder")}
          </h3>
        </div>

        {terms && (
          // As staff wrote them, line breaks kept.
          <p className="mt-4 min-h-0 flex-1 overflow-y-auto whitespace-pre-line rounded-xl border border-ink-200 p-4 text-sm leading-relaxed text-fg-muted">
            {terms}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {ui("cancel")}
          </Button>
          <Button onClick={onConfirm} loading={submitting}>
            {submitting ? ui("checkoutPlacing") : terms ? ui("acceptAndPlaceOrder") : ui("confirmPreOrderBtn")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
