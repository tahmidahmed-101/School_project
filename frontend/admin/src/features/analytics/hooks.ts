import { useCallback, useEffect, useState } from "react"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import type { Kind } from "@/hooks/use-kind"
import {
  fetchDashboard,
  fetchLowStock,
  fetchSalesTrend,
  fetchStockTurnover,
  reportKey,
  type Resource,
} from "./slices/reportingSlice"
import type { DateRangeParams } from "./types"

/**
 * The reporting endpoints accept reports.view OR accounting.view
 * (require_any_staff_permission in api/v1/admin/reporting/views.py); pass to useCan.
 */
export const REPORT_PERMISSIONS = ["reports.view", "accounting.view"] as const

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

export function useDashboardReport(range: DateRangeParams, kind: Kind, enabled = true) {
  const dispatch = useAppDispatch()
  const query = { ...range, kind }
  const key = reportKey(query)
  const res = useAppSelector((state) => state.reporting.dashboard)
  const retry = useRequest(enabled, key, () => dispatch(fetchDashboard(query)))
  return view(res, key, retry)
}

export function useSalesTrendReport(range: DateRangeParams, kind: Kind, enabled = true) {
  const dispatch = useAppDispatch()
  const query = { ...range, kind }
  const key = reportKey(query)
  const res = useAppSelector((state) => state.reporting.salesTrend)
  const retry = useRequest(enabled, key, () => dispatch(fetchSalesTrend(query)))
  return view(res, key, retry)
}

export function useStockTurnoverReport(range: DateRangeParams, kind: Kind, enabled = true) {
  const dispatch = useAppDispatch()
  const query = { ...range, kind }
  const key = reportKey(query)
  const res = useAppSelector((state) => state.reporting.stockTurnover)
  const retry = useRequest(enabled, key, () => dispatch(fetchStockTurnover(query)))
  return view(res, key, retry)
}

/** Low stock is a shop-stock figure: pre-order items carry no reorder point. */
export function useLowStockReport(enabled = true) {
  const dispatch = useAppDispatch()
  const res = useAppSelector((state) => state.reporting.lowStock)
  const retry = useRequest(enabled, "", () => dispatch(fetchLowStock()))
  return view(res, "", retry)
}
