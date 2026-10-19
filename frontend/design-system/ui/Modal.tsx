"use client";

import type { ReactNode } from "react";
import { usePresence } from "@/design-system/patterns/usePresence";
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
  /** How long the backdrop fades, and how long the dialog stays mounted on close so its own exit can finish. */
  durationMs?: number;
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
  durationMs = 200,
  children,
}: ModalProps) {
  useOverlay(open, onClose, lockScroll === undefined ? undefined : { lockScroll });
  const { mounted, shown } = usePresence(open, durationMs);

  // `data-shown` lets dialog content animate with `group-data-[shown=true]:` classes.
  return (
    <>
      {mounted && (
        <div data-shown={shown} className={`group fixed inset-0 z-50 ${containerClassName}`}>
          <button
            type="button"
            tabIndex={-1}
            onClick={onClose}
            style={{ transitionDuration: `${durationMs}ms` }}
            className={`fixed inset-0 cursor-default transition-opacity ${shown ? "opacity-100" : "opacity-0"} ${backdropClassName}`}
            aria-label={label}
          />
          {children}
        </div>
      )}
    </>
  );
}
