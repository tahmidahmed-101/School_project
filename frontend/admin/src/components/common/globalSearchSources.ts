import { useEffect, useMemo, useState } from "react"
import { Boxes, ShoppingCart, Users } from "lucide-react"
import type React from "react"
import { api } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import { formatCurrency, humanize } from "@/lib/format"
import { getNavGroups, hasPermission } from "@/app/modules"
import { customerDetailPath } from "@/features/users/paths"
import type { Kind } from "@/hooks/use-kind"

export interface SearchDestination {
  id: string
  title: string
  subtitle?: string
  section: string
  url: string
  icon: React.ElementType
  keywords: string[]
}

/** Every sidebar link the user can open, as search destinations (from the module registry). */
export function useNavDestinations(permissions: readonly string[] | undefined): SearchDestination[] {
  return useMemo(
    () =>
      getNavGroups(permissions).flatMap((group) =>
        group.sections.flatMap((section) =>
          section.items.map((item) => ({
            id: `nav-${item.url}`,
            title: item.title,
            subtitle: `${section.label} page`,
            section: "Navigation",
            url: item.url,
            icon: section.icon,
            keywords: [item.title, section.label, group.label].map((k) => k.toLowerCase()),
          }))
        )
      ),
    [permissions]
  )
}

interface OrderHit {
  id: string
  order_number: string
  order_type: Kind
  customer_name?: string | null
  customer_email?: string | null
  status: string
  grand_total: string
}

interface ProductHit {
  id: string
  name: string
  price?: string | null
  is_active: boolean
}

interface CustomerHit {
  id: string
  first_name?: string
  last_name?: string
  email: string
  phone?: string | null
}

const RESULTS_PER_SOURCE = 4
const KINDS: Kind[] = ["stock", "preorder"]

const SECTIONS = {
  stock: { orders: "Stock orders", order: "Order", products: "Stock products", customers: "Stock customers" },
  preorder: {
    orders: "Pre-orders",
    order: "Pre-order",
    products: "Pre-order products",
    customers: "Pre-order customers",
  },
} satisfies Record<Kind, Record<string, string>>

/** One list asked once per half, so every hit is known to belong to that half. */
function searchBothKinds<T>(url: string, params: (kind: Kind) => Record<string, string>, signal: AbortSignal) {
  return Promise.all(KINDS.map((kind) => searchList<T>(url, params(kind), signal).catch(() => [] as T[])))
}
const DEBOUNCE_MS = 250

async function searchList<T>(url: string, params: Record<string, string>, signal: AbortSignal): Promise<T[]> {
  const res = await api.get(url, { params: { ...params, page: 1, page_size: RESULTS_PER_SOURCE }, signal })
  return unwrapList<T>(res.data, 1, RESULTS_PER_SOURCE).items
}

/**
 * Live record search against the backend (orders, products, customers), debounced and
 * cancelled when the query changes. Every result names its half (stock or pre-order) and
 * opens that half's page. Sources the user lacks permission for are skipped, and a failing
 * source simply contributes no results.
 */
export function useRecordSearch(
  query: string,
  permissions: readonly string[] | undefined
): { results: SearchDestination[]; isSearching: boolean } {
  const [state, setState] = useState<{ query: string; results: SearchDestination[] }>({ query: "", results: [] })
  const q = query.trim()

  const canOrders = hasPermission(permissions, ["orders.view", "orders.manage"])
  const canProducts = hasPermission(permissions, ["catalog.view", "catalog.manage"])
  // /admin/users/ is admin-only on the backend.
  const canCustomers = hasPermission(permissions, "*")

  useEffect(() => {
    if (q.length < 2) return

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      const { signal } = controller
      const [orders, products, customers] = await Promise.allSettled([
        canOrders ? searchList<OrderHit>("/admin/orders/", { search: q }, signal) : Promise.resolve([]),
        canProducts
          ? searchBothKinds<ProductHit>(
              "/admin/catalog/products/",
              (kind) => ({ search: q, category_type: kind }),
              signal
            )
          : Promise.resolve([]),
        canCustomers
          ? searchBothKinds<CustomerHit>("/admin/users/", (kind) => ({ search: q, role: "customer", kind }), signal)
          : Promise.resolve([]),
      ])
      if (signal.aborted) return

      const results: SearchDestination[] = []
      if (orders.status === "fulfilled") {
        for (const o of orders.value) {
          const who = o.customer_name || o.customer_email || "Guest"
          const copy = SECTIONS[o.order_type === "preorder" ? "preorder" : "stock"]
          results.push({
            id: `ord-${o.id}`,
            title: `${copy.order} ${o.order_number}`,
            subtitle: `${who} • ${humanize(o.status)} • ${formatCurrency(o.grand_total)}`,
            section: copy.orders,
            url: `/order_detail/${o.id}`,
            icon: ShoppingCart,
            keywords: [],
          })
        }
      }
      if (products.status === "fulfilled") {
        products.value.forEach((hits, i) => {
          for (const p of hits) {
            results.push({
              id: `prod-${p.id}`,
              title: p.name,
              subtitle: `${p.price != null ? formatCurrency(p.price) : "No price"} • ${p.is_active ? "Active" : "Inactive"}`,
              section: SECTIONS[KINDS[i]].products,
              url: `/product_detail/${p.id}`,
              icon: Boxes,
              keywords: [],
            })
          }
        })
      }
      if (customers.status === "fulfilled") {
        customers.value.forEach((hits, i) => {
          const kind = KINDS[i]
          for (const c of hits) {
            const name = [c.first_name, c.last_name].filter(Boolean).join(" ")
            results.push({
              id: `cust-${kind}-${c.id}`,
              title: name || c.email,
              subtitle: [c.email, c.phone].filter(Boolean).join(" • "),
              section: SECTIONS[kind].customers,
              url: customerDetailPath(kind, c.id),
              icon: Users,
              keywords: [],
            })
          }
        })
      }
      setState({ query: q, results })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, canOrders, canProducts, canCustomers])

  // Results belong to the query they were fetched for; anything else is stale.
  const fresh = q.length >= 2 && state.query === q
  return { results: fresh ? state.results : [], isSearching: q.length >= 2 && !fresh }
}
