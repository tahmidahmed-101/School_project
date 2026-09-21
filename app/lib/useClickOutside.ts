"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Calls `onOutside` when a mousedown lands outside the referenced element. */
export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void) {
  // Keep the latest callback in a ref so callers can pass inline functions
  // without re-subscribing the document listener on every render.
  const onOutsideRef = useRef(onOutside);
  useEffect(() => {
    onOutsideRef.current = onOutside;
  });

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutsideRef.current();
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [ref]);
}
