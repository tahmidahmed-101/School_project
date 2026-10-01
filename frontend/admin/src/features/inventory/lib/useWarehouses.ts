import { useAllPages } from "@/hooks/use-all-pages"
import { WAREHOUSES_ENDPOINT } from "../api"
import type { Warehouse } from "../types"

/** All warehouses (every page), for filters and pickers. */
export function useWarehouses() {
  // Best-effort: pickers degrade to "default warehouse" only; the page's own list shows the error.
  const { items: warehouses, reload } = useAllPages<Warehouse>(WAREHOUSES_ENDPOINT)
  return { warehouses, reload }
}
