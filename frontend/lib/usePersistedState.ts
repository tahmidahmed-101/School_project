"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * useState that mirrors its value to localStorage. The first render always uses `initial`
 * (so server and client markup match); the saved value is applied after mount and writes
 * only start once that load has happened, so the saved copy is never overwritten by `initial`.
 */
export function usePersistedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) setValue(JSON.parse(saved) as T);
    } catch {
      // Ignore parse errors / blocked storage
    }
    setIsHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage quota exceeded or disabled
    }
  }, [key, value, isHydrated]);

  return [value, setValue];
}
