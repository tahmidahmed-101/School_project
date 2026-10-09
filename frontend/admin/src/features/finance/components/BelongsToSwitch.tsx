import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BelongsTo } from "../utils"

const VIEWS: { value: BelongsTo; label: string }[] = [
  { value: "stock", label: "Stock" },
  { value: "preorder", label: "Pre-order" },
  { value: "company", label: "Company" },
]

export function BelongsToSwitch({
  value,
  onChange,
  label,
}: {
  value: BelongsTo
  onChange: (view: BelongsTo) => void
  /** Read by screen readers, e.g. "Show expenses for". */
  label: string
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as BelongsTo)}>
      <TabsList aria-label={label}>
        {VIEWS.map((view) => (
          <TabsTrigger key={view.value} value={view.value} className="px-3">
            {view.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
