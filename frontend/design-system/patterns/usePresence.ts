"use client";

import { useEffect, useState } from "react";

/**
 * Keeps an element mounted through its exit transition. `mounted` drives rendering; `shown` flips one frame after
 * mount (so the enter transition runs) and back on close, `exitMs` before unmount.
 */
export function usePresence(open: boolean, exitMs: number) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted, shown };
}

/** Ease that approximates the spring the drawers used to slide with. */
export const SLIDE_EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";
