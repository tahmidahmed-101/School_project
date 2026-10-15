import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { Boxes, CreditCard, FileText, Images, Plug, Store } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/common/PageHeader"
import { useAppDispatch } from "@/app/hooks"
import {
  fetchBusinessProfile,
  fetchHeroSlides,
  fetchIntegrations,
  fetchModules,
  fetchPaymentMethods,
  fetchPromoLines,
} from "@/features/system/slices/businessSettingsSlice"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { BusinessProfileForm } from "./settings/BusinessProfileForm"
import { ModulesPanel } from "./settings/ModulesPanel"
import { PoliciesPanel } from "./settings/PoliciesPanel"
import { PaymentMethodsPanel } from "./settings/PaymentMethodsPanel"
import { IntegrationsPanel } from "./settings/IntegrationsPanel"
import { StorefrontContentPanel } from "./settings/StorefrontContentPanel"

const TABS = [
  { value: "business", label: "Business profile", icon: Store },
  { value: "storefront", label: "Storefront content", icon: Images },
  { value: "modules", label: "Modules", icon: Boxes },
  { value: "payments", label: "Payment methods", icon: CreditCard },
  { value: "policies", label: "Store policies", icon: FileText },
  { value: "integrations", label: "Integrations", icon: Plug },
] as const

const Settings = () => {
  useDocumentTitle("Shop settings")
  const dispatch = useAppDispatch()
  const canManage = useCan("settings.manage")
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get("tab")
  const tab = TABS.some((t) => t.value === requested) ? (requested as string) : "business"

  useEffect(() => {
    const requests = [
      dispatch(fetchBusinessProfile()),
      dispatch(fetchModules()),
      dispatch(fetchPaymentMethods("stock")),
      dispatch(fetchIntegrations()),
      dispatch(fetchHeroSlides()),
      dispatch(fetchPromoLines()),
    ]
    return () => requests.forEach((r) => r.abort())
  }, [dispatch])

  return (
    <div className="section-container space-y-6">
      <PageHeader
        title="Shop settings"
        description={
          canManage
            ? undefined
            : "You can view these settings but not change them."
        }
      />

      <Tabs value={tab} onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}>
        <div className="overflow-x-auto">
          <TabsList className="w-full md:w-fit">
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
        <TabsContent value="storefront" className="mt-4">
          <StorefrontContentPanel canManage={canManage} />
        </TabsContent>
        <TabsContent value="modules" className="mt-4">
          <ModulesPanel canManage={canManage} />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentMethodsPanel canManage={canManage} kind="stock" />
        </TabsContent>
        <TabsContent value="policies" className="mt-4">
          <PoliciesPanel />
        </TabsContent>
        <TabsContent value="integrations" className="mt-4">
          <IntegrationsPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default Settings
