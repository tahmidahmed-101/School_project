import { useEffect, useState } from "react"

/** How long dialogs take to animate out; keep in step with the `duration-200` on the dialog classes. */
const EXIT_MS = 200

/**
 * The last non-empty `value`. A dialog whose content comes from a selected record
 * (`open={!!record}`) would go blank the moment the record is cleared; this keeps showing the
 * record while the dialog animates shut.
 */
export function useLastValue<T>(value: T | null | undefined): T | null {
  const [last, setLast] = useState<T | null>(value ?? null)
  // Adjusted during render rather than in an effect, so there is no frame with stale content.
  if (value != null && value !== last) setLast(value)
  return value ?? last
}

/**
 * True while `open`, and for the length of the exit animation after it turns false. For a
 * dialog that should be unmounted when closed (so it starts fresh next time): mounting it on
 * this instead of on `open` lets it animate out before it is removed.
 */
export function useDelayedUnmount(open: boolean, delay = EXIT_MS): boolean {
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  useEffect(() => {
    if (open) return
    const timer = setTimeout(() => setMounted(false), delay)
    return () => clearTimeout(timer)
  }, [open, delay])
  return open || mounted
}
