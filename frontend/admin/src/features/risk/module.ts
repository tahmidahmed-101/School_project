import { ShieldAlert } from "lucide-react"
import { page, type FeatureModule } from "@/app/moduleTypes"

export const riskModule: FeatureModule = {
  routes: [
    { path: "fraud_cases", lazy: page(() => import("./components/FraudCases")) },
    { path: "fraud_cases/:id", lazy: page(() => import("./components/FraudCaseDetail")) },
    { path: "blocklists", lazy: page(() => import("./components/Blocklists")) },
  ],
  nav: [
    {
      label: "Risk",
      icon: ShieldAlert,
      group: "ADMIN",
      order: 20,
      items: [
        { title: "Fraud Cases", url: "/fraud_cases", permission: "risk.view" },
        { title: "Blocklists", url: "/blocklists", permission: "risk.view" },
      ],
    },
  ],
}
