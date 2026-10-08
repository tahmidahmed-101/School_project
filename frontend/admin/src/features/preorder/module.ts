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
    { path: "preorder_carts", lazy: page(() => import("../sales/components/Carts")) },
    { path: "preorder_movements", lazy: page(() => import("../inventory/components/StockLedger")) },
    { path: "preorder_reviews", lazy: page(() => import("../catalog/components/Reviews")) },
    { path: "preorder_questions", lazy: page(() => import("../catalog/components/Questions")) },
    { path: "preorder_price_reports", lazy: page(() => import("../catalog/components/PriceReports")) },
    { path: "preorder_purchasing/orders", lazy: page(() => import("../procurement/components/PurchaseOrders")) },
    {
      path: "preorder_purchasing/orders/new",
      lazy: page(() => import("../procurement/components/PurchaseOrderCreate")),
    },
    {
      path: "preorder_purchasing/orders/:id",
      lazy: page(() => import("../procurement/components/PurchaseOrderDetail")),
    },
    { path: "preorder_purchasing/receipts", lazy: page(() => import("../procurement/components/GoodsReceipts")) },
    { path: "preorder_purchasing/bills", lazy: page(() => import("../procurement/components/VendorBills")) },
    { path: "preorder_purchasing/payments", lazy: page(() => import("../procurement/components/VendorPayments")) },
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
        {
          title: "Purchase orders",
          url: "/preorder_purchasing/orders",
          permission: ["purchasing.view", "purchasing.manage"],
        },
        {
          title: "Goods receipts",
          url: "/preorder_purchasing/receipts",
          permission: ["purchasing.view", "purchasing.manage"],
        },
        { title: "Supplier bills", url: "/preorder_purchasing/bills", permission: ["accounting.view", "accounting.post", "invoices.manage"] },
        { title: "Supplier payments", url: "/preorder_purchasing/payments", permission: ["accounting.view", "accounting.post", "invoices.manage"] },
        { title: "Carts", url: "/preorder_carts", permission: ["orders.view", "orders.manage"] },
        {
          title: "Goods movements",
          url: "/preorder_movements",
          permission: ["inventory.view", "inventory.manage", "inventory.adjust"],
        },
        { title: "Reviews", url: "/preorder_reviews", permission: ["catalog.view", "catalog.manage"] },
        { title: "Questions", url: "/preorder_questions", permission: ["catalog.view", "catalog.manage"] },
        { title: "Price reports", url: "/preorder_price_reports", permission: ["catalog.view", "catalog.manage"] },
        { title: "Settings", url: "/preorder_settings", permission: "settings.view" },
      ],
    },
  ],
}
