"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { ArrowLeft, Trash2, X } from "lucide-react";
import { useOverlay } from "@/lib/useOverlay";
import { photo } from "@/lib/photo";
import { SLIDE_EASE, usePresence } from "@/design-system/patterns/usePresence";
import { Button } from "@/design-system/ui/Button";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the backdrop (click-away) button. */
  label: string;
  closeLabel: string;
  icon: ReactNode;
  title: ReactNode;
  /** Extra controls rendered before the close button. */
  actions?: ReactNode;
  /** Body and footer. They are laid out with `justify-between` under the header. */
  children: ReactNode;
}

/** Right-hand slide-in panel shared by the cart and wishlist. */
export function Drawer({ open, onClose, label, closeLabel, icon, title, actions, children }: DrawerProps) {
  useOverlay(open, onClose);
  const { mounted, shown } = usePresence(open, 300);

  return (
    <>
      {mounted && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <button
            type="button"
            onClick={onClose}
            className={`backdrop-blur-xs fixed inset-0 cursor-default bg-ink-900/50 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
            aria-label={label}
          />

          <div className="pointer-events-none fixed inset-y-0 right-0 flex w-full max-w-full justify-end">
            <div
              className={`pointer-events-auto z-10 flex w-full flex-col justify-between border-l border-ink-200 bg-card p-5 shadow-2xl transition-transform duration-300 sm:max-w-md sm:p-6 ${SLIDE_EASE} ${shown ? "translate-x-0" : "translate-x-full"}`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-ink-200 pb-3">
                  <div className="flex items-center gap-2">
                    {icon}
                    <h3 className="text-base font-bold text-fg">{title}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {actions}
                    <button
                      type="button"
                      onClick={onClose}
                      className="cursor-pointer rounded-lg bg-surface-muted p-1.5 text-fg-subtle transition-colors hover:bg-surface-strong hover:text-fg"
                      aria-label={closeLabel}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>

              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Scrollable list area between a drawer's header and footer. */
export function DrawerBody({ children }: { children: ReactNode }) {
  return <div className="my-4 flex-1 space-y-3 overflow-y-auto pr-1">{children}</div>;
}

interface DrawerEmptyProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
}

export function DrawerEmpty({ icon, title, subtitle, actionLabel, onAction }: DrawerEmptyProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center space-y-4 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold-50 text-gold-700 ring-1 ring-gold-200">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold text-fg">{title}</p>
        <p className="mx-auto max-w-xs text-xs text-fg-muted">{subtitle}</p>
      </div>
      <Button size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}

/** Line item card inside a drawer list (cart line, wishlist entry). */
export function DrawerItem({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-3 rounded-xl border border-ink-200/80 bg-ink-50 p-3">{children}</div>;
}

export function DrawerRemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative ml-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-ink-600 transition-colors before:absolute before:-inset-1 before:content-[''] hover:bg-danger-surface hover:text-danger"
      aria-label={label}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

/** Pinned bottom block: primary action first, then a quiet "back to shopping" link. */
export function DrawerFooter({
  children,
  backLabel,
  onBack,
}: {
  children: ReactNode;
  backLabel: string;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4 border-t border-ink-200 pt-4">
      {children}
      <div className="pt-1 text-center">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-gold-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{backLabel}</span>
        </button>
      </div>
    </div>
  );
}

/** 64px square product thumbnail used by drawer line items. */
export function DrawerItemImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-card">
      <Image src={photo(src)} alt={alt} fill sizes="64px" className="object-cover" />
    </div>
  );
}
