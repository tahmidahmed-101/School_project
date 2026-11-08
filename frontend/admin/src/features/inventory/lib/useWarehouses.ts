import { useAllPages } from "@/hooks/use-all-pages"
import { WAREHOUSES_ENDPOINT } from "../api"
import type { Warehouse } from "../types"

/** Every warehouse, for filters and pickers. */
export function useWarehouses() {
  // Best-effort: pickers degrade to "default warehouse" only; the page's own list shows the error.
  const { items: warehouses, reload } = useAllPages<Warehouse>(WAREHOUSES_ENDPOINT, { kind: "stock" })
  return { warehouses, reload }
}
