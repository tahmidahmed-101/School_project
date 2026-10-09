import { useLayoutEffect, useSyncExternalStore } from "react"
import { useLocation } from "react-router-dom"

export type Kind = "stock" | "preorder"

export function kindOfPath(pathname: string): Kind {
  return pathname.startsWith("/preorder") ? "preorder" : "stock"
}

// Detail and form routes ("/order_detail/:id") are shared by both halves; the open record says which half it is.
let record: { pathname: string; kind: Kind } | null = null
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const getRecord = () => record
const setRecord = (next: typeof record) => {
  record = next
  listeners.forEach((listener) => listener())
}

const isSharedRecordPath = (pathname: string) => /^\/[a-z_]+_(detail|form)\//.test(pathname)

/** The half named by `?kind=` on a shared route, known before the record loads. */
export function kindHint(pathname: string, search: string): Kind | undefined {
  if (!isSharedRecordPath(pathname)) return undefined
  const value = new URLSearchParams(search).get("kind")
  return value === "preorder" || value === "stock" ? value : undefined
}

export const withKind = (path: string, kind: Kind) => `${path}${path.includes("?") ? "&" : "?"}kind=${kind}`

/** The half the current page belongs to: /preorder routes, else the kind of the record a shared page has open. */
export function useKind(): Kind {
  const { pathname, search } = useLocation()
  const current = useSyncExternalStore(subscribe, getRecord)
  if (kindOfPath(pathname) === "preorder") return "preorder"
  if (current?.pathname === pathname) return current.kind
  return kindHint(pathname, search) ?? "stock"
}

export function useKindHint(): Kind | undefined {
  const { pathname, search } = useLocation()
  if (kindOfPath(pathname) === "preorder") return "preorder"
  return kindHint(pathname, search)
}

export function useRecordKind(kind: Kind | undefined) {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    if (!kind) return
    setRecord({ pathname, kind })
    return () => {
      if (record?.pathname === pathname) setRecord(null)
    }
  }, [pathname, kind])
}
