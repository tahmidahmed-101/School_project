"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useOverlay } from "@/lib/useOverlay";
import { photo } from "@/lib/photo";

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

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="backdrop-blur-xs fixed inset-0 cursor-default bg-ink-900/50"
            aria-label={label}
          />

          <div className="pointer-events-none fixed inset-y-0 right-0 flex w-full max-w-full justify-end">
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="pointer-events-auto z-10 flex w-full flex-col justify-between border-l border-ink-200 bg-card p-5 shadow-2xl sm:max-w-md sm:p-6"
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
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Scrollable list area between a drawer's header and footer. */
export function DrawerBody({ children }: { children: ReactNode }) {
  return <div className="my-4 flex-1 space-y-3 overflow-y-auto pr-1">{children}</div>;
}

interface DrawerEmptyProps {
  icon: ReactNode;
  iconWrapClassName: string;
  title: string;
  subtitle: string;
  subtitleClassName?: string;
  actionLabel: string;
  onAction: () => void;
}

export function DrawerEmpty({
  icon,
  iconWrapClassName,
  title,
  subtitle,
  subtitleClassName = "",
  actionLabel,
  onAction,
}: DrawerEmptyProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center space-y-4 p-6 text-center">
      <div className={`flex h-16 w-16 items-center justify-center rounded-full ${iconWrapClassName}`}>{icon}</div>
      <div className="space-y-1">
        <p className="text-sm font-bold text-fg">{title}</p>
        <p className={`text-xs text-fg-muted ${subtitleClassName}`}>{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="cursor-pointer rounded-full bg-accent px-5 py-2 text-xs font-bold text-accent-fg shadow-md transition-all hover:bg-accent-hover"
      >
        {actionLabel}
      </button>
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
