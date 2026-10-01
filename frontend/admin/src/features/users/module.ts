import { Users } from "lucide-react"
import { page, type FeatureModule } from "@/app/moduleTypes"
import { ADMIN_ONLY } from "@/features/system/permissions"

// /admin/users/ and /admin/staff/ are IsAdmin-only on the backend (no staff permission code
// unlocks them), so both links are admin-only.
export const usersModule: FeatureModule = {
  routes: [
    { path: "customers", lazy: page(() => import("./components/Customers")) },
    { path: "customer_detail/:id", lazy: page(() => import("./components/CustomerDetail")) },
    { path: "staffs", lazy: page(() => import("./components/Staffs")) },
    { path: "staff_form/:id", lazy: page(() => import("./components/StaffForm")) },
    { path: "profile", lazy: page(() => import("./components/Profile")) },
  ],
  nav: [
    {
      label: "People",
      icon: Users,
      group: "MAIN",
      order: 30,
      items: [
        { title: "Customers", url: "/customers", permission: ADMIN_ONLY },
        { title: "Staff", url: "/staffs", permission: ADMIN_ONLY },
      ],
    },
  ],
}
