import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { CreditCard, FileText, Images } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/common/PageHeader"
import { useAppDispatch } from "@/app/hooks"
import {
  fetchBusinessProfile,
  fetchHeroSlides,
  fetchPaymentMethods,
  fetchPolicies,
  fetchPromoLines,
} from "@/features/system/slices/businessSettingsSlice"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { HeroSlidesCard } from "./settings/HeroSlidesCard"
import { PaymentMethodsPanel } from "./settings/PaymentMethodsPanel"
import { PreorderDepositForm } from "./settings/PreorderDepositForm"
import { PreorderReturnsCard } from "./settings/PreorderReturnsCard"
import { PreorderTermsCard } from "./settings/PreorderTermsCard"
import { PromoLinesCard } from "./settings/PromoLinesCard"

// The same tab bar as Shop settings; `?tab=` keeps the open tab across reloads and links.
const TABS = [
  { value: "payments", label: "Deposit & payments", icon: CreditCard },
  { value: "storefront", label: "Storefront content", icon: Images },
  { value: "terms", label: "Returns & terms", icon: FileText },
] as const

const PreorderSettings = () => {
  useDocumentTitle("Pre-order settings")
  const dispatch = useAppDispatch()
  const canManage = useCan("settings.manage")
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get("tab")
  const tab = TABS.some((t) => t.value === requested) ? (requested as string) : "payments"

  useEffect(() => {
    const requests = [
      dispatch(fetchBusinessProfile()),
      dispatch(fetchHeroSlides()),
      dispatch(fetchPromoLines()),
      dispatch(fetchPolicies()),
      dispatch(fetchPaymentMethods("preorder")),
    ]
    return () => requests.forEach((r) => r.abort())
  }, [dispatch])

  return (
    <div className="section-container space-y-6">
      <PageHeader
        title="Pre-order settings"
        description={
          canManage
            ? undefined
            : "You can view these settings but not change them."
        }
      />
      <Tabs value={tab} onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}>
        <div className="overflow-x-auto">
          <TabsList className="w-max min-w-full md:w-fit md:min-w-0">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="min-w-max gap-2">
                <Icon className="h-4 w-4" /> {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="payments" className="mt-4 space-y-6">
          <PreorderDepositForm canManage={canManage} />
          <PaymentMethodsPanel canManage={canManage} kind="preorder" />
        </TabsContent>
        <TabsContent value="storefront" className="mt-4 space-y-6">
          <HeroSlidesCard canManage={canManage} placement="preorder" />
          <PromoLinesCard canManage={canManage} placement="preorder" />
        </TabsContent>
        <TabsContent value="terms" className="mt-4 space-y-6">
          <PreorderReturnsCard canManage={canManage} />
          <PreorderTermsCard canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default PreorderSettings
