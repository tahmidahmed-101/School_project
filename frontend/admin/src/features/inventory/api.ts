import { api, apiCall, extractApiError } from "@/lib/api/client"
import { unwrapEnvelope } from "@/lib/api/envelope"
import { blobErrorToJson, saveBlob } from "@/lib/download"
import { invalidateAllPages } from "@/hooks/use-all-pages"
import type {
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

export async function fetchStockStatus(): Promise<StockStatusSummary> {
  try {
    const res = await api.get(`${I}/stock-status/`)
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
export const postBulkAdjustments = (adjustments: StockAdjustmentPayload[]) =>
  apiCall<{ results: { index: number; entry: StockLedgerEntry }[]; count: number }>(() =>
    api.post(`${I}/adjustments/bulk/`, { adjustments })
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
    saveBlob(res.data as Blob, "stock-ledger.csv")
  } catch (err) {
    throw extractApiError(await blobErrorToJson(err))
  }
}

// ---- reservations (orders app) ----
export const releaseReservation = (id: string) =>
  apiCall<StockReservation>(() => api.post(`/admin/orders/reservations/${id}/release/`))
