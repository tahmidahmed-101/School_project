import { useSelector } from "react-redux"
import { useCan } from "@/hooks/use-can"
import type { procurementReducers } from "../reducers"

type ProcurementState = {
  [K in keyof typeof procurementReducers]: ReturnType<(typeof procurementReducers)[K]>
}

/**
 * Typed selector over this domain's slices. Typed against the procurement reducer map itself
 * (spread into the root store under the same keys) so it doesn't depend on RootState.
 */
export function useProcurementSelector<R>(selector: (state: ProcurementState) => R): R {
  return useSelector(selector as (state: unknown) => R)
}

/** Purchasing writes need purchasing.manage. */
export const useCanManagePurchasing = () => useCan("purchasing.manage")
/** Vendor bills/payments: accounting.post or invoices.manage may write. */
export const useCanWriteBills = () => useCan("accounting.post", "invoices.manage")
