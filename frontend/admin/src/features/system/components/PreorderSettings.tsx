import { useEffect } from "react"
import { PageHeader } from "@/components/common/PageHeader"
import { useAppDispatch } from "@/app/hooks"
import {
  fetchBusinessProfile,
  fetchHeroSlides,
  fetchPolicies,
  fetchPromoLines,
} from "@/features/system/slices/businessSettingsSlice"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { HeroSlidesCard } from "./settings/HeroSlidesCard"
import { PreorderDepositForm } from "./settings/PreorderDepositForm"
import { PreorderReturnsCard } from "./settings/PreorderReturnsCard"
import { PromoLinesCard } from "./settings/PromoLinesCard"

const PreorderSettings = () => {
  useDocumentTitle("Pre-order Settings")
  const dispatch = useAppDispatch()
  const canManage = useCan("settings.manage")

  useEffect(() => {
    const requests = [
      dispatch(fetchBusinessProfile()),
      dispatch(fetchHeroSlides()),
      dispatch(fetchPromoLines()),
      dispatch(fetchPolicies()),
    ]
    return () => requests.forEach((r) => r.abort())
  }, [dispatch])

  return (
    <div className="section-container space-y-6">
      <PageHeader
        title="Pre-order Settings"
        description={
          canManage
            ? undefined
            : "You can view these settings; changing them needs the settings.manage permission."
        }
      />
      <PreorderDepositForm canManage={canManage} />
      <HeroSlidesCard canManage={canManage} placement="preorder" />
      <PromoLinesCard canManage={canManage} placement="preorder" />
      <PreorderReturnsCard canManage={canManage} />
    </div>
  )
}

export default PreorderSettings
