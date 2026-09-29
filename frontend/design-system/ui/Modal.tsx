"use client";

import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOverlay } from "@/lib/useOverlay";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the backdrop (click-away) element. */
  label: string;
  /** Alignment/overflow/padding for the fixed wrapper around the backdrop and dialog. */
  containerClassName?: string;
  /** Backdrop tint + blur. */
  backdropClassName?: string;
  lockScroll?: boolean;
  /** The dialog box itself (its own motion/animation is left to the caller, since dialogs differ). */
  children: ReactNode;
}

const DEFAULT_CONTAINER_CLASS = "flex items-center justify-center p-4";
const DEFAULT_BACKDROP_CLASS = "bg-ink-900/60 backdrop-blur-sm";

/** Centered/overlay modal shell (backdrop + escape/scroll-lock) shared by every full-screen dialog. */
export function Modal({
  open,
  onClose,
  label,
  containerClassName = DEFAULT_CONTAINER_CLASS,
  backdropClassName = DEFAULT_BACKDROP_CLASS,
  lockScroll,
  children,
}: ModalProps) {
  useOverlay(open, onClose, lockScroll === undefined ? undefined : { lockScroll });

  return (
    <AnimatePresence>
      {open && (
        <div className={`fixed inset-0 z-50 ${containerClassName}`}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className={`fixed inset-0 cursor-default ${backdropClassName}`}
            aria-label={label}
          />
          {children}
        </div>
      )}
    </AnimatePresence>
  );
}
