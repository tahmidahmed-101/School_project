import { useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { Banknote, Truck, Undo2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/common/PageHeader"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchPolicies } from "@/features/system/slices/businessSettingsSlice"
import type { PolicyKind } from "@/features/system/types"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { PolicyEditor } from "./policies/PolicyEditor"
import { SectionState } from "./settings/SectionState"

// PolicyKind on the backend: one row per kind, created empty and unpublished.
const TABS: { value: PolicyKind; label: string; icon: typeof Truck }[] = [
  { value: "shipping", label: "Shipping", icon: Truck },
  { value: "returns", label: "Returns", icon: Undo2 },
  { value: "refund", label: "Refund", icon: Banknote },
]

/**
 * The shipping, return and refund policies customers read on the storefront. Each is written
 * in English and Bangla; the storefront shows a policy only while it is published.
 */
const StorePolicies = () => {
  useDocumentTitle("Store Policies")
  const dispatch = useAppDispatch()
  const canManage = useCan("settings.manage")
  const { data: policies, status, error } = useAppSelector((state) => state.businessSettings.policies)
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get("kind")
  const kind = TABS.some((t) => t.value === requested) ? (requested as PolicyKind) : "shipping"

  useEffect(() => {
    const request = dispatch(fetchPolicies())
    return () => request.abort()
  }, [dispatch])

  return (
    <div className="section-container space-y-6">
      <PageHeader
        title="Store Policies"
        description={
          canManage
            ? "Customers see a policy on the storefront only while it is published."
            : "You can view these policies; changing them needs the settings.manage permission."
        }
      />

      {policies.length === 0 ? (
        <SectionState
          status={status}
          error={error}
          hasData={false}
          onRetry={() => dispatch(fetchPolicies())}
          label="store policies"
        />
      ) : (
        <Tabs value={kind} onValueChange={(value) => setSearchParams({ kind: value }, { replace: true })}>
          <div className="overflow-x-auto">
            <TabsList className="w-full md:w-fit">
              {TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="min-w-max gap-2">
                  <Icon className="h-4 w-4" /> {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {/* Every editor stays mounted, so switching tabs doesn't throw away unsaved text. */}
          {policies.map((policy) => (
            <TabsContent key={policy.kind} value={policy.kind} forceMount className="mt-4 data-[state=inactive]:hidden">
              <PolicyEditor policy={policy} canManage={canManage} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}

export default StorePolicies
