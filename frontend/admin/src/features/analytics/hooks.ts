import { useCallback, useEffect, useState } from "react"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { hasPermission } from "@/app/modules"
import type { ApiError } from "@/lib/api/client"
import { rangeKey } from "./dateRange"
import {
  fetchDashboard,
  fetchLowStock,
  fetchSalesTrend,
  fetchStockTurnover,
  type Resource,
} from "./slices/reportingSlice"
import type { DateRangeParams } from "./types"

export function isForbidden(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as Partial<ApiError>).status === 403
}

/**
 * The reporting endpoints accept reports.view OR accounting.view
 * (require_any_staff_permission in api/v1/admin/reporting/views.py).
 */
export function useCanViewReports(): boolean {
  const permissions = useAppSelector((state) => state.auth.user?.permissions)
  return hasPermission(permissions, "reports.view") || hasPermission(permissions, "accounting.view")
}

export interface ReportView<T> {
  /** Data for the requested window only (never a previous window's numbers). */
  data: T | null
  isLoading: boolean
  /** A newer request is in flight while `data` is shown. */
  isRefreshing: boolean
  error: unknown
  retry: () => void
}

function view<T>(res: Resource<T>, key: string, retry: () => void): ReportView<T> {
  const data = res.key === key ? res.data : null
  const failed = res.status === "failed"
  return {
    data: failed ? null : data,
    isLoading: !failed && data === null,
    isRefreshing: res.status === "loading" && data !== null,
    error: failed ? res.error : null,
    retry,
  }
}

/** Dispatches `start` whenever `key` changes or retry is pressed; aborts on change/unmount. */
function useRequest(enabled: boolean, key: string, start: () => { abort: () => void }) {
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const request = start()
    return () => request.abort()
    // `start` is rebuilt every render; `key` + `attempt` are what should re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, attempt])
  return useCallback(() => setAttempt((n) => n + 1), [])
}

export function useDashboardReport(range: DateRangeParams, enabled = true) {
  const dispatch = useAppDispatch()
  const key = rangeKey(range)
  const res = useAppSelector((state) => state.reporting.dashboard)
  const retry = useRequest(enabled, key, () => dispatch(fetchDashboard(range)))
  return view(res, key, retry)
}

export function useSalesTrendReport(range: DateRangeParams, enabled = true) {
  const dispatch = useAppDispatch()
  const key = rangeKey(range)
  const res = useAppSelector((state) => state.reporting.salesTrend)
  const retry = useRequest(enabled, key, () => dispatch(fetchSalesTrend(range)))
  return view(res, key, retry)
}

export function useStockTurnoverReport(range: DateRangeParams, enabled = true) {
  const dispatch = useAppDispatch()
  const key = rangeKey(range)
  const res = useAppSelector((state) => state.reporting.stockTurnover)
  const retry = useRequest(enabled, key, () => dispatch(fetchStockTurnover(range)))
  return view(res, key, retry)
}

export function useLowStockReport(enabled = true) {
  const dispatch = useAppDispatch()
  const res = useAppSelector((state) => state.reporting.lowStock)
  const retry = useRequest(enabled, "", () => dispatch(fetchLowStock()))
  return view(res, "", retry)
}
