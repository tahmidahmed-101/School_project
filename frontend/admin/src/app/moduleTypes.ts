import type { ComponentType } from "react"
import type { LucideIcon } from "lucide-react"
import type { RouteObject } from "react-router-dom"

/**
 * Each feature domain (src/features/<domain>/module.ts) describes its own routes;
 * src/app/modules.ts collects them. The sidebar is one list in src/app/nav.ts.
 */

/** Sidebar groups: the two halves (one shown at a time) and the pages of the whole company. */
export const NAV_GROUPS = ["STOCK", "PREORDER", "BUSINESS"] as const
export type NavGroup = (typeof NAV_GROUPS)[number]
export const NAV_GROUP_LABELS: Record<NavGroup, string> = { STOCK: "Shop", PREORDER: "Pre-order", BUSINESS: "Business" }

export interface NavItem {
  title: string
  url: string
  /**
   * Backend StaffPermission code required to see this link (e.g. "orders.view"), or a
   * list meaning "any of these" (the backend often accepts view OR manage).
   * Admins/superusers get ["*"] and see everything. Omit for links every staff user sees.
   */
  permission?: string | readonly string[]
  /** Settings → Modules key ("reporting", "logistics", "procurement"); the link and its pages go while it is off. */
  module?: string
}

export interface NavSection {
  label: string
  icon: LucideIcon
  group: NavGroup
  items: NavItem[]
}

export interface FeatureModule {
  /** Child routes of the authenticated dashboard layout (paths relative to "/"). */
  routes: RouteObject[]
}

/**
 * Route-level code splitting via React Router's `lazy`: the page module is fetched on
 * first navigation. Usage: `{ path: "orders", lazy: page(() => import("./components/Orders")) }`
 */
export const page =
  (loader: () => Promise<{ default: ComponentType }>) =>
  async () => ({ Component: (await loader()).default })
