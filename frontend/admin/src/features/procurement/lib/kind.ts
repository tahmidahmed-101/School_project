import type { Kind } from "@/hooks/use-kind"

export const purchasingBase = (kind?: Kind) => (kind === "preorder" ? "/preorder_purchasing" : "/purchasing")

export const purchasingTitle = (kind: Kind, text: string) =>
  kind === "preorder" ? `Pre-order ${text.toLowerCase()}` : text

/** The stock half says "vendor", the pre-order half "supplier": one term per half, the same as its menu. */
export const billsTitle = (kind: Kind) => (kind === "preorder" ? "Pre-order supplier bills" : "Supplier bills")
export const paymentsTitle = (kind: Kind) => (kind === "preorder" ? "Pre-order supplier payments" : "Supplier payments")
