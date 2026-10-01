import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { Boxes, CreditCard, Plug, Store } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeading } from "@/components/common/PageHeading"
import { useAppDispatch } from "@/app/hooks"
import {
  fetchBusinessProfile,
  fetchIntegrations,
  fetchModules,
  fetchPaymentMethods,
} from "@/features/system/slices/businessSettingsSlice"
import { useCan } from "@/features/system/permissions"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { BusinessProfileForm } from "./settings/BusinessProfileForm"
import { ModulesPanel } from "./settings/ModulesPanel"
import { PaymentMethodsPanel } from "./settings/PaymentMethodsPanel"
import { IntegrationsPanel } from "./settings/IntegrationsPanel"

const TABS = [
  { value: "business", label: "Business Profile", icon: Store },
  { value: "modules", label: "Modules", icon: Boxes },
  { value: "payments", label: "Payment Methods", icon: CreditCard },
  { value: "integrations", label: "Integrations", icon: Plug },
] as const

const Settings = () => {
  useDocumentTitle("Settings")
  const dispatch = useAppDispatch()
  const canManage = useCan()("settings.manage")
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get("tab")
  const tab = TABS.some((t) => t.value === requested) ? (requested as string) : "business"

  useEffect(() => {
    const requests = [
      dispatch(fetchBusinessProfile()),
      dispatch(fetchModules()),
      dispatch(fetchPaymentMethods()),
      dispatch(fetchIntegrations()),
    ]
    return () => requests.forEach((r) => r.abort())
  }, [dispatch])

  return (
    <div className="section-container space-y-6">
      <PageHeading
        title="Settings"
        description={
          canManage
            ? "Your business details, which modules are switched on, and how customers can pay."
            : "You can view these settings; changing them needs the settings.manage permission."
        }
      />

      <Tabs value={tab} onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}>
        <div className="overflow-x-auto">
          <TabsList className="w-full md:w-fit bg-muted p-1">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="min-w-max gap-2">
                <Icon className="h-4 w-4" /> {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="business" className="mt-4">
          <BusinessProfileForm canManage={canManage} />
        </TabsContent>
        <TabsContent value="modules" className="mt-4">
          <ModulesPanel canManage={canManage} />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentMethodsPanel canManage={canManage} />
        </TabsContent>
        <TabsContent value="integrations" className="mt-4">
          <IntegrationsPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default Settings
