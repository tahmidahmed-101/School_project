import { useSyncExternalStore } from "react"

/**
 * True while the CSS media query matches. Layouts that differ by screen size use this to
 * render one version, rather than rendering both and hiding one with CSS.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}
