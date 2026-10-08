"use client";

import { useEffect, type RefObject } from "react";

/** Moves keyboard focus into `ref` while `open`, and gives it back to whatever had it when the overlay closes. */
export function useFocusReturn(open: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, [open, ref]);
}
