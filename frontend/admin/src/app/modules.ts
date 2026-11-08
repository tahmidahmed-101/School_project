import { NAV_GROUPS, type FeatureModule, type NavGroup, type NavSection } from "./moduleTypes"
import { navSections } from "./nav"
import { dashboardModule } from "@/features/dashboard/module"
import { catalogModule } from "@/features/catalog/module"
import { inventoryModule } from "@/features/inventory/module"
import { salesModule } from "@/features/sales/module"
import { financeModule } from "@/features/finance/module"
import { usersModule } from "@/features/users/module"
import { marketingModule } from "@/features/marketing/module"
import { systemModule } from "@/features/system/module"
import { riskModule } from "@/features/risk/module"
import { procurementModule } from "@/features/procurement/module"

// Register new feature domains here.
export const featureModules: FeatureModule[] = [
  dashboardModule,
  catalogModule,
  inventoryModule,
  salesModule,
  procurementModule,
  financeModule,
  usersModule,
  marketingModule,
  riskModule,
  systemModule,
]

export const dashboardRoutes = featureModules.flatMap((m) => m.routes)

/**
 * True when the user's permission list grants `permission` ("*" grants everything).
 * An array means "any of these codes".
 */
export function hasPermission(
  permissions: readonly string[] | undefined,
  permission?: string | readonly string[]
): boolean {
  if (!permission || (Array.isArray(permission) && permission.length === 0)) return true
  if (!permissions) return false
  if (permissions.includes("*")) return true
  const required: readonly string[] = typeof permission === "string" ? [permission] : permission
  return required.some((code) => permissions.includes(code))
}

/** Sidebar sections by group, with links the user can't access, or whose module is switched off, removed. */
export function getNavGroups(
  permissions: readonly string[] | undefined,
  offModules: readonly string[] = []
): { label: NavGroup; sections: NavSection[] }[] {
  const sections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => hasPermission(permissions, item.permission) && !(item.module && offModules.includes(item.module))
      ),
    }))
    .filter((section) => section.items.length > 0)

  return NAV_GROUPS.map((label) => ({
    label,
    sections: sections.filter((s) => s.group === label),
  })).filter((group) => group.sections.length > 0)
}

/** The module a page belongs to, from the sidebar link it sits under (a detail page under its list). */
export function moduleOfPath(pathname: string): string | undefined {
  return navSections
    .flatMap((section) => section.items)
    .find((item) => item.module && (pathname === item.url || pathname.startsWith(`${item.url}/`)))?.module
}
