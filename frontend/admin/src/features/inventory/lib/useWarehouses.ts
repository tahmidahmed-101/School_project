import { useCallback, useEffect, useState } from "react"
import { fetchAllWarehouses } from "../api"
import type { Warehouse } from "../types"

/** All warehouses (every page), for filters and pickers. */
export function useWarehouses() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const items = await fetchAllWarehouses()
        if (!cancelled) setWarehouses(items)
      } catch {
        // Pickers degrade to "default warehouse" only; the page's own list shows the error.
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  return { warehouses, reload }
}
