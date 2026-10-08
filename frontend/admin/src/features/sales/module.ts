import { page, type FeatureModule } from "@/app/moduleTypes"

export const salesModule: FeatureModule = {
  routes: [
    { path: "orders", lazy: page(() => import("./components/Orders")) },
    { path: "orders/new", lazy: page(() => import("./components/CreateOrder")) },
    { path: "order_detail/:id", lazy: page(() => import("./components/OrderDetail")) },
    { path: "carts", lazy: page(() => import("./components/Carts")) },
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
}
