import { Settings } from "lucide-react"
import { page, type FeatureModule } from "@/app/moduleTypes"
import { ADMIN_ONLY } from "./permissions"

export const systemModule: FeatureModule = {
  routes: [
    { path: "settings", lazy: page(() => import("./components/Settings")) },
    { path: "audit-logs", lazy: page(() => import("../audit/components/AuditLogs")) },
    { path: "login-history", lazy: page(() => import("../audit/components/LoginHistory")) },
  ],
  nav: [
    {
      label: "System",
      icon: Settings,
      group: "ADMIN",
      order: 10,
      items: [
        { title: "Settings", url: "/settings", permission: "settings.view" },
        // /admin/audit/ is IsAdmin-only on the backend.
        { title: "Audit Logs", url: "/audit-logs", permission: ADMIN_ONLY },
        { title: "Login History", url: "/login-history", permission: ADMIN_ONLY },
      ],
    },
  ],
}
