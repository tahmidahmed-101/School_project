import { StatusBadge } from "@/components/common/StatusBadge"
import type { HeroSlidePlacement } from "@/features/system/types"

export function SharedCell({ placement }: { placement: HeroSlidePlacement }) {
  if (placement !== "both") return null
  return <StatusBadge status="shared" tone="secondary" label="Also on the other shop" className="normal-case" />
}
