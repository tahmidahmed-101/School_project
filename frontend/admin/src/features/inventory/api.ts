import { api, apiCall, extractApiError } from "@/lib/api/client"
import { unwrapEnvelope } from "@/lib/api/envelope"
import { blobErrorToJson, saveBlob } from "@/lib/download"
import type {
  QuickProductPayload,
  StockAdjustmentPayload,
  StockIntakePayload,
  StockLedgerEntry,
  StockLookupResult,
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

/** Exact SKU or barcode lookup. */
export const lookupStock = (q: string) => apiCall<StockLookupResult>(() => api.get(`${I}/lookup/`, { params: { q } }))

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
export const createQuickProduct = (payload: QuickProductPayload) =>
  apiCall<StockLookupResult>(() => api.post(`${I}/quick-products/`, payload))

// ---- warehouses ----
export const WAREHOUSES_ENDPOINT = `${I}/warehouses/`
export const createWarehouse = (payload: WarehousePayload) =>
  apiCall<Warehouse>(() => api.post(WAREHOUSES_ENDPOINT, payload))
export const updateWarehouse = (id: string, payload: WarehousePayload) =>
  apiCall<Warehouse>(() => api.patch(`${I}/warehouses/${id}/`, payload))

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
