import { page, type FeatureModule } from "@/app/moduleTypes"

export const inventoryModule: FeatureModule = {
  routes: [
    { path: "inventory", lazy: page(() => import("./components/StockOverview")) },
    { path: "inventory/ledger", lazy: page(() => import("./components/StockLedger")) },
    { path: "inventory/reservations", lazy: page(() => import("./components/Reservations")) },
    { path: "inventory/transfers", lazy: page(() => import("./components/StockTransfers")) },
    { path: "warehouses", lazy: page(() => import("./components/Warehouses")) },
  ],
}
