import type { Kind } from "@/hooks/use-kind"

export const deliveryPath = (kind: Kind, page: "shipping_zones" | "shipping_rates") =>
  kind === "preorder" ? `/preorder_${page}` : `/${page}`

export const deliveryTitle = (kind: Kind, text: string) => (kind === "preorder" ? `Pre-order ${text.toLowerCase()}` : text)
