import { useEffect, useState } from "react"
import { toast } from "sonner"

import { api, getApiErrorMessage } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import type { PreorderReport } from "@/features/sales/types"

/** GET /admin/orders/preorder-report/ — the open pre-order book. `reload` fetches it again. */
export function usePreorderReport() {
  const [report, setReport] = useState<PreorderReport | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    api
      .get("/admin/orders/preorder-report/", { signal: controller.signal })
      .then((res) => setReport(unwrapItem<PreorderReport>(res.data)))
      .catch((err) => {
        if (!controller.signal.aborted) toast.error(getApiErrorMessage(err, "Couldn't load the pre-order report"))
      })
    return () => controller.abort()
  }, [reloadKey])

  return { report, reload: () => setReloadKey((key) => key + 1) }
}
