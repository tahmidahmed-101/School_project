import { page, type FeatureModule } from "@/app/moduleTypes"

export const dashboardModule: FeatureModule = {
  routes: [
    { index: true, lazy: page(() => import("./components/Dashboard")) },
    { path: "analytics", lazy: page(() => import("../analytics/components/Analytics")) },
  ],
}
