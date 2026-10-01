import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapEnvelope } from "@/lib/api/envelope"
import { previousWindow, rangeKey } from "../dateRange"
import type {
  DashboardData,
  DateRangeParams,
  LowStockItem,
  SalesTrendPoint,
  StockTurnover,
} from "../types"

// /admin/reporting/* are read-only aggregates (not list resources), so this is plain
// thunks rather than sliceFactory. Each resource tracks the window it was fetched for and
// the id of the latest request, so a slow response for an old range never overwrites a
// newer one.

export type RequestStatus = "idle" | "loading" | "succeeded" | "failed"

export interface Resource<T> {
  data: T | null
  /** rangeKey() of the window `data` belongs to ("" for window-less endpoints). */
  key: string | null
  status: RequestStatus
  error: unknown
  requestId: string | null
}

export interface TurnoverComparison {
  current: number
  previous: number
}

interface ReportingState {
  dashboard: Resource<DashboardData>
  salesTrend: Resource<SalesTrendPoint[]>
  stockTurnover: Resource<TurnoverComparison>
  lowStock: Resource<LowStockItem[]>
}

const empty = <T>(): Resource<T> => ({
  data: null,
  key: null,
  status: "idle",
  error: null,
  requestId: null,
})

const initialState: ReportingState = {
  dashboard: empty(),
  salesTrend: empty(),
  stockTurnover: empty(),
  lowStock: empty(),
}

export const fetchDashboard = createAsyncThunk(
  "reporting/fetchDashboard",
  async (range: DateRangeParams, { rejectWithValue, signal }) => {
    try {
      const res = await api.get("/admin/reporting/dashboard/", { params: range, signal })
      return unwrapEnvelope<DashboardData>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const fetchSalesTrend = createAsyncThunk(
  "reporting/fetchSalesTrend",
  async (range: DateRangeParams, { rejectWithValue, signal }) => {
    try {
      const res = await api.get("/admin/reporting/sales-trend/", { params: range, signal })
      return unwrapEnvelope<SalesTrendPoint[]>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

/** Turnover for the window and for the equally long window right before it. */
export const fetchStockTurnover = createAsyncThunk(
  "reporting/fetchStockTurnover",
  async (range: DateRangeParams, { rejectWithValue, signal }) => {
    try {
      const [current, previous] = await Promise.all(
        [range, previousWindow(range)].map((params) =>
          api.get("/admin/reporting/stock-turnover/", { params, signal })
        )
      )
      return {
        current: Number(unwrapEnvelope<StockTurnover>(current.data).turnover_ratio) || 0,
        previous: Number(unwrapEnvelope<StockTurnover>(previous.data).turnover_ratio) || 0,
      } satisfies TurnoverComparison
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const fetchLowStock = createAsyncThunk(
  "reporting/fetchLowStock",
  async (_: void, { rejectWithValue, signal }) => {
    try {
      const res = await api.get("/admin/reporting/low-stock/", { signal })
      return unwrapEnvelope<LowStockItem[]>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

function keyOf(arg: DateRangeParams | void): string {
  return arg ? rangeKey(arg) : ""
}

// Resource<unknown> accepts every concrete Resource<T> draft (properties are covariant).
function onPending(res: Resource<unknown>, requestId: string) {
  res.status = "loading"
  res.error = null
  res.requestId = requestId
}

function onFulfilled(res: Resource<unknown>, requestId: string, payload: unknown, key: string) {
  if (res.requestId !== requestId) return
  res.status = "succeeded"
  res.data = payload
  res.key = key
  res.error = null
  res.requestId = null
}

function onRejected(
  res: Resource<unknown>,
  action: { payload?: unknown; error: unknown; meta: { requestId: string; aborted: boolean } }
) {
  if (res.requestId !== action.meta.requestId) return
  res.requestId = null
  if (action.meta.aborted) {
    res.status = res.data ? "succeeded" : "idle"
    return
  }
  res.status = "failed"
  res.error = action.payload ?? action.error
}

const reportingSlice = createSlice({
  name: "reporting",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboard.pending, (s, a) => onPending(s.dashboard, a.meta.requestId))
      .addCase(fetchDashboard.fulfilled, (s, a) =>
        onFulfilled(s.dashboard, a.meta.requestId, a.payload, keyOf(a.meta.arg))
      )
      .addCase(fetchDashboard.rejected, (s, a) => onRejected(s.dashboard, a))

      .addCase(fetchSalesTrend.pending, (s, a) => onPending(s.salesTrend, a.meta.requestId))
      .addCase(fetchSalesTrend.fulfilled, (s, a) =>
        onFulfilled(s.salesTrend, a.meta.requestId, a.payload, keyOf(a.meta.arg))
      )
      .addCase(fetchSalesTrend.rejected, (s, a) => onRejected(s.salesTrend, a))

      .addCase(fetchStockTurnover.pending, (s, a) => onPending(s.stockTurnover, a.meta.requestId))
      .addCase(fetchStockTurnover.fulfilled, (s, a) =>
        onFulfilled(s.stockTurnover, a.meta.requestId, a.payload, keyOf(a.meta.arg))
      )
      .addCase(fetchStockTurnover.rejected, (s, a) => onRejected(s.stockTurnover, a))

      .addCase(fetchLowStock.pending, (s, a) => onPending(s.lowStock, a.meta.requestId))
      .addCase(fetchLowStock.fulfilled, (s, a) => onFulfilled(s.lowStock, a.meta.requestId, a.payload, ""))
      .addCase(fetchLowStock.rejected, (s, a) => onRejected(s.lowStock, a))
  },
})

export default reportingSlice.reducer
