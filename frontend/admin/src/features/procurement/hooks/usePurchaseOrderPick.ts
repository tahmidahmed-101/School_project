import { useState } from "react"
import { toast } from "sonner"
import { api, apiCall, getApiErrorMessage } from "@/lib/api/client"
import type { PurchaseOrder } from "../types"

/**
 * A purchase order chosen from a picker inside a dialog. Picking loads the full PO (with
 * lines); closing the dialog clears the pick.
 */
export function usePurchaseOrderPick(onOpenChange: (open: boolean) => void) {
  const [picked, setPicked] = useState<PurchaseOrder | null>(null)

  const handleOpenChange = (next: boolean) => {
    if (!next) setPicked(null)
    onOpenChange(next)
  }

  const handlePick = async (id: string) => {
    try {
      setPicked(await apiCall<PurchaseOrder>(() => api.get(`/admin/procurement/purchase-orders/${id}/`)))
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't load that purchase order"))
    }
  }

  return { picked, handleOpenChange, handlePick }
}
