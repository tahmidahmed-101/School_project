import { page, type FeatureModule } from "@/app/moduleTypes"

export const riskModule: FeatureModule = {
  routes: [
    { path: "fraud_cases", lazy: page(() => import("./components/FraudCases")) },
    { path: "fraud_cases/:id", lazy: page(() => import("./components/FraudCaseDetail")) },
    { path: "blocklists", lazy: page(() => import("./components/Blocklists")) },
  ],
}
