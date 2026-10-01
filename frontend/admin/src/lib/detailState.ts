import { getApiErrorMessage } from "@/lib/api/client"

export type SingleStatus = "idle" | "loading" | "succeeded" | "failed"

/** True when a rejected request (see extractApiError) was a 404 / "not_found". */
export function isNotFoundError(err: unknown): boolean {
  const e = err as { status?: number; code?: string } | null
  if (e?.status === 404 || e?.code === "not_found") return true
  return /not\s*found/i.test(getApiErrorMessage(err, ""))
}

/**
 * Picks which placeholder a detail page should render, from the factory's `singleStatus`.
 * Returns null once the record for `id` is loaded and the page can render normally.
 */
export function resolveDetailState(
  status: SingleStatus,
  error: unknown,
  loaded: boolean
): "loading" | "not-found" | "error" | null {
  if (status === "failed") return isNotFoundError(error) ? "not-found" : "error"
  // Not loaded yet: "idle" (first paint, before the fetch effect dispatches), "loading", or a
  // "succeeded" left over from the previously viewed id until the new fetch's pending lands.
  if (!loaded) return "loading"
  return null
}
