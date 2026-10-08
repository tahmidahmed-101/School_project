import { useAllPages } from "@/hooks/use-all-pages"
import type { Kind } from "@/hooks/use-kind"
import { WAREHOUSES_ENDPOINT } from "../api"
import type { Warehouse } from "../types"

/** Every warehouse of one half, for filters and pickers. */
export function useWarehouses(kind: Kind) {
  // Best-effort: pickers degrade to "default warehouse" only; the page's own list shows the error.
  const { items: warehouses, reload } = useAllPages<Warehouse>(WAREHOUSES_ENDPOINT, { kind })
  return { warehouses, reload }
}
