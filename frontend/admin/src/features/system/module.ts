import { page, type FeatureModule } from "@/app/moduleTypes"

export const systemModule: FeatureModule = {
  routes: [
    { path: "settings", lazy: page(() => import("./components/Settings")) },
    { path: "policies", lazy: page(() => import("./components/StorePolicies")) },
    { path: "audit-logs", lazy: page(() => import("../audit/components/AuditLogs")) },
    { path: "login-history", lazy: page(() => import("../audit/components/LoginHistory")) },
  ],
}
