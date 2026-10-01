import { ShoppingCart, Truck } from "lucide-react"
import { page, type FeatureModule } from "@/app/moduleTypes"

export const salesModule: FeatureModule = {
  routes: [
    { path: "orders", lazy: page(() => import("./components/Orders")) },
    { path: "orders/new", lazy: page(() => import("./components/CreateOrder")) },
    { path: "order_detail/:id", lazy: page(() => import("./components/OrderDetail")) },
    { path: "payments", lazy: page(() => import("../payments/components/Payments")) },
    { path: "payment_detail/:id", lazy: page(() => import("../payments/components/PaymentDetail")) },
    { path: "returns", lazy: page(() => import("../returns/components/Returns")) },
    { path: "return_detail/:id", lazy: page(() => import("../returns/components/ReturnDetail")) },
    { path: "shipments", lazy: page(() => import("../shipping/components/Shipments")) },
    { path: "shipment_detail/:id", lazy: page(() => import("../shipping/components/ShipmentDetail")) },
    { path: "carriers", lazy: page(() => import("../shipping/components/Carriers")) },
    { path: "shipping_zones", lazy: page(() => import("../shipping/components/ShippingZones")) },
    { path: "shipping_rates", lazy: page(() => import("../shipping/components/ShippingRates")) },
  ],
  nav: [
    {
      label: "Sales",
      icon: ShoppingCart,
      group: "MAIN",
      order: 10,
      items: [
        { title: "Orders", url: "/orders", permission: ["orders.view", "orders.manage"] },
        { title: "Payments", url: "/payments", permission: ["orders.view", "orders.manage"] },
        // The RMA endpoints require returns.manage even for reading.
        { title: "Returns", url: "/returns", permission: "returns.manage" },
      ],
    },
    {
      label: "Logistics",
      icon: Truck,
      group: "OPERATIONS",
      order: 20,
      items: [
        { title: "Shipments", url: "/shipments", permission: ["shipments.view", "shipments.update"] },
        { title: "Carriers", url: "/carriers", permission: ["shipments.view", "shipments.update"] },
        { title: "Delivery Zones", url: "/shipping_zones", permission: ["shipments.view", "shipments.update"] },
        { title: "Shipping Rates", url: "/shipping_rates", permission: ["shipments.view", "shipments.update"] },
      ],
    },
  ],
}
