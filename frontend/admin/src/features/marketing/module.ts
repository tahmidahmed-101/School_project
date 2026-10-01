import { Megaphone } from "lucide-react"
import { page, type FeatureModule } from "@/app/moduleTypes"

// Coupons are guarded by orders.view / orders.manage on the backend (not marketing.*).
export const marketingModule: FeatureModule = {
  routes: [
    { path: "coupons", lazy: page(() => import("./components/Coupons")) },
    { path: "coupon_form/:id", lazy: page(() => import("./components/CouponForm")) },
    { path: "subscribers", lazy: page(() => import("./components/Subscribers")) },
  ],
  nav: [
    {
      label: "Marketing",
      icon: Megaphone,
      group: "MAIN",
      order: 40,
      items: [
        { title: "Coupons", url: "/coupons", permission: ["orders.view", "orders.manage"] },
        { title: "Subscribers", url: "/subscribers", permission: ["marketing.view", "marketing.manage"] },
      ],
    },
  ],
}
