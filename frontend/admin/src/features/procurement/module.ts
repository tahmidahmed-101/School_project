import { ShoppingBasket } from "lucide-react"
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
  nav: [
    {
      label: "Purchasing",
      icon: ShoppingBasket,
      group: "OPERATIONS",
      order: 30,
      items: [
        { title: "Purchase Orders", url: "/purchasing/orders", permission: ["purchasing.view", "purchasing.manage"] },
        { title: "Goods Receipts", url: "/purchasing/receipts", permission: ["purchasing.view", "purchasing.manage"] },
        { title: "Suppliers", url: "/purchasing/suppliers", permission: ["purchasing.view", "purchasing.manage"] },
        // Vendor bills/payments are readable with accounting.view, accounting.post or invoices.manage;
        // NavItem takes one code, so gate on accounting.view (admins see all).
        { title: "Vendor Bills", url: "/purchasing/bills", permission: ["accounting.view", "accounting.post", "invoices.manage"] },
        { title: "Vendor Payments", url: "/purchasing/payments", permission: ["accounting.view", "accounting.post", "invoices.manage"] },
      ],
    },
  ],
}
