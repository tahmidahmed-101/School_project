import { redirect } from "react-router-dom"
import { page, type FeatureModule } from "@/app/moduleTypes"

export const systemModule: FeatureModule = {
  routes: [
    { path: "settings", lazy: page(() => import("./components/Settings")) },
    { path: "policies", loader: () => redirect("/settings?tab=policies") },
    { path: "audit-logs", lazy: page(() => import("../audit/components/AuditLogs")) },
    { path: "login-history", lazy: page(() => import("../audit/components/LoginHistory")) },
  ],
}
