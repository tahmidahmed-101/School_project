import { api, extractApiError } from "@/lib/api/client"
import { unwrapEnvelope, unwrapItem, unwrapList } from "@/lib/api/envelope"
import { blobErrorToJson, saveBlob } from "@/features/catalog/api"
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

/** Inventory write/action endpoints. Each throws a normalised ApiError on failure. */
async function call<T>(fn: () => Promise<{ data: unknown }>): Promise<T> {
  try {
    const res = await fn()
    return unwrapItem<T>(res.data)
  } catch (err) {
    throw extractApiError(err)
  }
}

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
export const lookupStock = (q: string) => call<StockLookupResult>(() => api.get(`${I}/lookup/`, { params: { q } }))

export const postIntake = (payload: StockIntakePayload) =>
  call<StockLedgerEntry>(() => api.post(`${I}/intake/`, payload))
export const postAdjustment = (payload: StockAdjustmentPayload) =>
  call<StockLedgerEntry>(() => api.post(`${I}/adjustments/`, payload))
/** All-or-nothing batch: the server rolls the whole batch back if any line fails. */
export const postBulkAdjustments = (adjustments: StockAdjustmentPayload[]) =>
  call<{ results: { index: number; entry: StockLedgerEntry }[]; count: number }>(() =>
    api.post(`${I}/adjustments/bulk/`, { adjustments })
  )
export const postWriteOff = (payload: StockWriteOffPayload) =>
  call<StockLedgerEntry>(() => api.post(`${I}/write-offs/`, payload))
export const createQuickProduct = (payload: QuickProductPayload) =>
  call<StockLookupResult>(() => api.post(`${I}/quick-products/`, payload))

// ---- warehouses ----
/** Every warehouse (all pages), for pickers. */
export async function fetchAllWarehouses(): Promise<Warehouse[]> {
  const out: Warehouse[] = []
  try {
    for (let page = 1; page < 20; page++) {
      const res = await api.get(`${I}/warehouses/`, { params: { page, page_size: 100 } })
      const { items, meta } = unwrapList<Warehouse>(res.data, page, 100)
      out.push(...items)
      if (out.length >= meta.count || items.length === 0) break
    }
  } catch (err) {
    throw extractApiError(err)
  }
  return out
}
export const createWarehouse = (payload: WarehousePayload) =>
  call<Warehouse>(() => api.post(`${I}/warehouses/`, payload))
export const updateWarehouse = (id: string, payload: WarehousePayload) =>
  call<Warehouse>(() => api.patch(`${I}/warehouses/${id}/`, payload))

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
  call<StockReservation>(() => api.post(`/admin/orders/reservations/${id}/release/`))
