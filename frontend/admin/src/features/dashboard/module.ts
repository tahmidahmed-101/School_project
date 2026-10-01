import { LayoutDashboard } from "lucide-react"
import { page, type FeatureModule } from "@/app/moduleTypes"

export const dashboardModule: FeatureModule = {
  routes: [
    { index: true, lazy: page(() => import("./components/Dashboard")) },
    { path: "analytics", lazy: page(() => import("../analytics/components/Analytics")) },
  ],
  nav: [
    {
      label: "Home",
      icon: LayoutDashboard,
      group: "MAIN",
      order: 0,
      items: [
        { title: "Overview", url: "/" },
        { title: "Analytics", url: "/analytics", permission: "reports.view" },
      ],
    },
  ],
}
