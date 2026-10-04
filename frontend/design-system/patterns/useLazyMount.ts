"use client";

import { useEffect, useState } from "react";

/**
 * When to mount a piece of UI that starts out closed (a drawer, a menu, a modal) and is loaded as its own chunk:
 * as soon as it is wanted, or else once the page has loaded and the browser is idle. Its code then stays out of
 * the first load, yet it is normally already there (closed) by the time the shopper taps, so it opens without a
 * wait and with its animation.
 */
export function useLazyMount(wanted: boolean): boolean {
  const [ready, setReady] = useState(false);
  if (wanted && !ready) setReady(true);

  useEffect(() => {
    if (ready) return;
    let idle = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const mount = () => setReady(true);
    const whenIdle = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(mount, { timeout: 4000 });
      else timer = setTimeout(mount, 2500);
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });
    return () => {
      window.removeEventListener("load", whenIdle);
      if (idle) window.cancelIdleCallback(idle);
      clearTimeout(timer);
    };
  }, [ready]);

  return ready;
}
