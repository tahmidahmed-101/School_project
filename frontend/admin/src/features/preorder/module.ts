import { CalendarClock } from "lucide-react"
import { page, type FeatureModule } from "@/app/moduleTypes"

// Every route of the pre-order half starts with "preorder" (see hooks/use-kind).
export const preorderModule: FeatureModule = {
  routes: [
    { path: "preorders", lazy: page(() => import("../sales/components/Orders")) },
    { path: "preorder_products", lazy: page(() => import("../catalog/components/Products")) },
    { path: "preorder_categories", lazy: page(() => import("../catalog/components/Categories")) },
    { path: "preorder_arrivals", lazy: page(() => import("../inventory/components/PreorderArrivals")) },
    { path: "preorder_payments", lazy: page(() => import("../payments/components/Payments")) },
    { path: "preorder_shipments", lazy: page(() => import("../shipping/components/Shipments")) },
    { path: "preorder_returns", lazy: page(() => import("../returns/components/Returns")) },
    { path: "preorder_settings", lazy: page(() => import("../system/components/PreorderSettings")) },
  ],
  nav: [
    {
      label: "Pre-orders",
      icon: CalendarClock,
      group: "MAIN",
      order: 11,
      items: [
        { title: "Orders", url: "/preorders", permission: ["orders.view", "orders.manage"] },
        { title: "Products", url: "/preorder_products", permission: ["catalog.view", "catalog.manage"] },
        { title: "Categories", url: "/preorder_categories", permission: ["catalog.view", "catalog.manage"] },
        {
          title: "Arrivals",
          url: "/preorder_arrivals",
          permission: ["inventory.view", "inventory.manage", "inventory.adjust"],
        },
        { title: "Payments", url: "/preorder_payments", permission: ["orders.view", "orders.manage"] },
        { title: "Shipments", url: "/preorder_shipments", permission: ["shipments.view", "shipments.update"] },
        { title: "Returns", url: "/preorder_returns", permission: "returns.manage" },
        { title: "Settings", url: "/preorder_settings", permission: "settings.view" },
      ],
    },
  ],
}
