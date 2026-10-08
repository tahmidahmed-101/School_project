import { api, apiCall, extractApiError } from "@/lib/api/client"
import { unwrapEnvelope } from "@/lib/api/envelope"
import { blobErrorToJson, saveBlob } from "@/lib/download"
import { invalidateAllPages } from "@/hooks/use-all-pages"
import type { Kind } from "@/hooks/use-kind"
import type {
  PreorderAllocationResult,
  PreorderReport,
  StockAdjustmentPayload,
  StockIntakePayload,
  StockLedgerEntry,
  StockReservation,
  StockStatusSummary,
  StockWriteOffPayload,
  Warehouse,
  WarehousePayload,
} from "./types"

const I = "/admin/inventory"

export async function fetchStockStatus(kind?: Kind): Promise<StockStatusSummary> {
  try {
    const res = await api.get(`${I}/stock-status/`, { params: { kind } })
    return unwrapEnvelope<StockStatusSummary>(res.data)
  } catch (err) {
    throw extractApiError(err)
  }
}

/** Removes a stock record. The backend refuses while it still holds on-hand or reserved quantity. */
export const deleteStockItem = (id: string) => apiCall<unknown>(() => api.delete(`${I}/stock-items/${id}/`))

export const postIntake = (payload: StockIntakePayload) =>
  apiCall<StockLedgerEntry>(() => api.post(`${I}/intake/`, payload))
export const postAdjustment = (payload: StockAdjustmentPayload) =>
  apiCall<StockLedgerEntry>(() => api.post(`${I}/adjustments/`, payload))
/** All-or-nothing batch: the server rolls the whole batch back if any line fails. */
export const postBulkAdjustments = (adjustments: StockAdjustmentPayload[], kind: Kind) =>
  apiCall<{ results: { index: number; entry: StockLedgerEntry }[]; count: number }>(() =>
    api.post(`${I}/adjustments/bulk/`, { kind, adjustments })
  )
export const postWriteOff = (payload: StockWriteOffPayload) =>
  apiCall<StockLedgerEntry>(() => api.post(`${I}/write-offs/`, payload))

// ---- warehouses ----
export const WAREHOUSES_ENDPOINT = `${I}/warehouses/`
const warehousesChanged = <R>(res: R) => {
  invalidateAllPages(WAREHOUSES_ENDPOINT)
  return res
}
export const createWarehouse = (payload: WarehousePayload) =>
  apiCall<Warehouse>(() => api.post(WAREHOUSES_ENDPOINT, payload).then(warehousesChanged))
export const updateWarehouse = (id: string, payload: WarehousePayload) =>
  apiCall<Warehouse>(() => api.patch(`${I}/warehouses/${id}/`, payload).then(warehousesChanged))

// ---- ledger ----
export async function downloadLedgerExport(filters: Record<string, unknown>) {
  try {
    const res = await api.get(`${I}/ledger-entries/export/`, { params: filters, responseType: "blob" })
    saveBlob(res.data as Blob, filters.kind === "preorder" ? "pre-order-goods-movements.csv" : "stock-ledger.csv")
  } catch (err) {
    throw extractApiError(await blobErrorToJson(err))
  }
}

// ---- pre-order arrivals (orders app) ----
export const fetchPreorderReport = () => apiCall<PreorderReport>(() => api.get("/admin/orders/preorder-report/"))
export const allocatePreorderStock = () =>
  apiCall<PreorderAllocationResult>(() => api.post("/admin/orders/preorder-allocation/"))

// ---- reservations (orders app) ----
export const releaseReservation = (id: string) =>
  apiCall<StockReservation>(() => api.post(`/admin/orders/reservations/${id}/release/`))
