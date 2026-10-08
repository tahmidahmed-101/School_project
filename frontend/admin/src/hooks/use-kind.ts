import { useLocation } from "react-router-dom"

export type Kind = "stock" | "preorder"

export function kindOfPath(pathname: string): Kind {
  return pathname.startsWith("/preorder") ? "preorder" : "stock"
}

/** Which half of the dashboard the current page belongs to; every pre-order route starts with /preorder. */
export function useKind(): Kind {
  return kindOfPath(useLocation().pathname)
}
