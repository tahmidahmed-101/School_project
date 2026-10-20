import { useCallback, useMemo } from "react"
import { useAllPages } from "@/hooks/use-all-pages"
import type { Kind } from "@/hooks/use-kind"
import { fromPaisa, toPaisa } from "@/lib/money"
import type { PurchaseOrder, VendorBill } from "../types"
import { poReceivedTotal } from "../utils"

/**
 * What each purchase order can still be billed for: its received value minus its live bills.
 * Mirrors the backend's 3-way match (vendor_bills._billed_elsewhere), which counts every bill
 * that is neither deleted nor void, so the same delivery is never billed twice.
 */
export function useUnbilledValue(kind: Kind, { enabled = true }: { enabled?: boolean } = {}) {
  const { items: bills, isLoading, reload } = useAllPages<VendorBill>(
    "/admin/procurement/vendor-bills/",
    { kind },
    { enabled }
  )

  const billedByPo = useMemo(() => {
    const totals = new Map<string, bigint>()
    for (const bill of bills) {
      if (bill.status === "void") continue
      totals.set(bill.purchase_order_id, (totals.get(bill.purchase_order_id) ?? BigInt(0)) + toPaisa(bill.amount))
    }
    return totals
  }, [bills])

  /** Billed so far, as a decimal string. */
  const billedFor = useCallback(
    (po: PurchaseOrder) => fromPaisa(billedByPo.get(po.id) ?? BigInt(0)),
    [billedByPo]
  )
  /** Received but not billed yet, never below zero, as a decimal string. */
  const unbilledFor = useCallback(
    (po: PurchaseOrder) => {
      const left = toPaisa(poReceivedTotal(po)) - (billedByPo.get(po.id) ?? BigInt(0))
      return fromPaisa(left > 0 ? left : BigInt(0))
    },
    [billedByPo]
  )

  return { billedFor, unbilledFor, isLoading, reload }
}
