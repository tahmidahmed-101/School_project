import type { Kind } from "@/hooks/use-kind"

export const customerListPath = (kind: Kind) => (kind === "preorder" ? "/preorder_customers" : "/customers")

export const customerDetailPath = (kind: Kind, id: string) =>
  kind === "preorder" ? `/preorder_customers/${id}` : `/customer_detail/${id}`
