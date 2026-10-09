import { page, type FeatureModule } from "@/app/moduleTypes"

export const procurementModule: FeatureModule = {
  routes: [
    { path: "purchasing/suppliers", lazy: page(() => import("./components/Suppliers")) },
    { path: "purchasing/orders", lazy: page(() => import("./components/PurchaseOrders")) },
    { path: "purchasing/orders/new", lazy: page(() => import("./components/PurchaseOrderCreate")) },
    { path: "purchasing/orders/:id", lazy: page(() => import("./components/PurchaseOrderDetail")) },
    { path: "purchasing/receipts", lazy: page(() => import("./components/GoodsReceipts")) },
    { path: "purchasing/bills", lazy: page(() => import("./components/VendorBills")) },
    { path: "purchasing/payments", lazy: page(() => import("./components/VendorPayments")) },
  ],
}
