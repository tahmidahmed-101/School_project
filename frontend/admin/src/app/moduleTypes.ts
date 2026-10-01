import type { ComponentType } from "react"
import type { LucideIcon } from "lucide-react"
import type { RouteObject } from "react-router-dom"

/**
 * Each feature domain (src/features/<domain>/module.ts) describes its own routes and
 * sidebar entries; src/app/modules.ts collects them. Adding a page means touching only
 * the owning domain's files, never the router or the sidebar.
 */

/** Sidebar groups, rendered in this order. */
export const NAV_GROUPS = ["MAIN", "OPERATIONS", "FINANCE", "ADMIN"] as const
export type NavGroup = (typeof NAV_GROUPS)[number]

export interface NavItem {
  title: string
  url: string
  /**
   * Backend StaffPermission code required to see this link (e.g. "orders.view"), or a
   * list meaning "any of these" (the backend often accepts view OR manage).
   * Admins/superusers get ["*"] and see everything. Omit for links every staff user sees.
   */
  permission?: string | readonly string[]
}

export interface NavSection {
  label: string
  icon: LucideIcon
  group: NavGroup
  /** Position within its group (lower first). */
  order: number
  items: NavItem[]
}

export interface FeatureModule {
  /** Child routes of the authenticated dashboard layout (paths relative to "/"). */
  routes: RouteObject[]
  nav: NavSection[]
}

/**
 * Route-level code splitting via React Router's `lazy`: the page module is fetched on
 * first navigation. Usage: `{ path: "orders", lazy: page(() => import("./components/Orders")) }`
 */
export const page =
  (loader: () => Promise<{ default: ComponentType }>) =>
  async () => ({ Component: (await loader()).default })
