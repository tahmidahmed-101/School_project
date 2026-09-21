"use client";

import { useEffect } from "react";

/**
 * Behaviour shared by every drawer / modal / sheet while it is open:
 * lock background scroll, and close on Escape when `onClose` is given.
 */
export function useOverlay(
  isOpen: boolean,
  onClose?: () => void,
  { lockScroll = true }: { lockScroll?: boolean } = {},
) {
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    if (onClose) window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (lockScroll) document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, lockScroll]);
}
