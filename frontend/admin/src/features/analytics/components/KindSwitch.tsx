import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Kind } from "@/hooks/use-kind"

export function KindSwitch({ value, onChange }: { value: Kind; onChange: (kind: Kind) => void }) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as Kind)}>
      <TabsList aria-label="Show figures for">
        <TabsTrigger value="stock" className="px-3">
          Stock
        </TabsTrigger>
        <TabsTrigger value="preorder" className="px-3">
          Pre-order
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
