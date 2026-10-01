import { Warehouse } from "lucide-react"
import { page, type FeatureModule } from "@/app/moduleTypes"

export const inventoryModule: FeatureModule = {
  routes: [
    { path: "inventory", lazy: page(() => import("./components/StockOverview")) },
    { path: "inventory/ledger", lazy: page(() => import("./components/StockLedger")) },
    { path: "inventory/reservations", lazy: page(() => import("./components/Reservations")) },
    { path: "warehouses", lazy: page(() => import("./components/Warehouses")) },
  ],
  nav: [
    {
      label: "Inventory",
      icon: Warehouse,
      group: "OPERATIONS",
      order: 10,
      items: [
        { title: "Stock", url: "/inventory", permission: ["inventory.view", "inventory.manage", "inventory.adjust"] },
        { title: "Stock Ledger", url: "/inventory/ledger", permission: ["inventory.view", "inventory.manage", "inventory.adjust"] },
        { title: "Warehouses", url: "/warehouses", permission: ["inventory.view", "inventory.manage", "inventory.adjust"] },
        // Served by the orders app: GET needs orders.view (release needs orders.manage).
        { title: "Reservations", url: "/inventory/reservations", permission: ["orders.view", "orders.manage"] },
      ],
    },
  ],
}
