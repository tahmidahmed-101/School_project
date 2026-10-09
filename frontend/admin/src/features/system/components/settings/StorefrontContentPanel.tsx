import { FreeDeliveryForm } from "./FreeDeliveryForm"
import { HeroSlidesCard } from "./HeroSlidesCard"
import { PromoLinesCard } from "./PromoLinesCard"

export function StorefrontContentPanel({ canManage }: { canManage: boolean }) {
  return (
    <div className="space-y-6">
      <FreeDeliveryForm canManage={canManage} />
      <HeroSlidesCard canManage={canManage} placement="home" />
      <PromoLinesCard canManage={canManage} placement="home" />
    </div>
  )
}
