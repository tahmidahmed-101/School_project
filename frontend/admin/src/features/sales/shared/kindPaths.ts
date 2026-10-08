import type { Kind } from "@/hooks/use-kind"

/** The list pages of each half; detail pages are shared and pick their half from the row's order_type. */
export const KIND_PATHS: Record<Kind, { orders: string; payments: string; shipments: string; returns: string }> = {
  stock: { orders: "/orders", payments: "/payments", shipments: "/shipments", returns: "/returns" },
  preorder: {
    orders: "/preorders",
    payments: "/preorder_payments",
    shipments: "/preorder_shipments",
    returns: "/preorder_returns",
  },
}

/** "order" or "pre-order", for sentences that name the thing. */
export const orderNoun = (kind: Kind) => (kind === "preorder" ? "pre-order" : "order")
