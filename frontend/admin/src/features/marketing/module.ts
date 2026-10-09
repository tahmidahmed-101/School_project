import { page, type FeatureModule } from "@/app/moduleTypes"

// Coupons and sales are guarded by orders.view / orders.manage on the backend (not marketing.*).
export const marketingModule: FeatureModule = {
  routes: [
    { path: "sales", lazy: page(() => import("./components/Sales")) },
    { path: "sale_form/:id", lazy: page(() => import("./components/SaleForm")) },
    { path: "coupons", lazy: page(() => import("./components/Coupons")) },
    { path: "coupon_form/:id", lazy: page(() => import("./components/CouponForm")) },
    { path: "subscribers", lazy: page(() => import("./components/Subscribers")) },
  ],
}
