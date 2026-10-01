import { useState } from "react"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { SortSelect } from "@/components/common/SortSelect"
import type { Option } from "@/lib/types"

/** The Status + Sort filters shared by the purchase order and vendor bill lists. */
export function useStatusSortFilters(statusOptions: Option[], sortOptions: Option[]) {
  const [status, setStatus] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)

  return {
    params: { status: status?.value, ordering: ordering?.value },
    filters: [
      {
        component: (
          <ExampleComboboxCustomItems frameworks={statusOptions} placeholder="Status" value={status} onValueChange={setStatus} />
        ),
      },
      { component: <SortSelect options={sortOptions} value={ordering} onChange={setOrdering} /> },
    ],
  }
}
