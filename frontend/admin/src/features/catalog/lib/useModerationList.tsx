import { useState } from "react"

import { Combobox } from "@/components/common/ComboBox"
import { SortSelect } from "@/components/common/SortSelect"
import { useListPage, type ListSliceState } from "@/hooks/use-list-page"
import type { Option } from "@/lib/types"

/** Search, one filter and a sort order (the first is the default) for the reviews, questions and price-report lists. */
export function useModerationList({
  fetch,
  state,
  filter,
  orderingOptions,
}: {
  fetch: Parameters<typeof useListPage>[0]["fetch"]
  state: ListSliceState
  filter: { param: string; placeholder: string; options: Option[] }
  orderingOptions: Option[]
}) {
  const [selected, setSelected] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(orderingOptions[0])

  const list = useListPage({
    fetch,
    state,
    params: { [filter.param]: selected?.value, ordering: ordering?.value ?? orderingOptions[0].value },
  })

  return {
    list,
    isFiltered: Boolean(list.debouncedSearch || selected),
    // With the filter on, a changed row may no longer belong in the list.
    reloadIfFiltered: () => {
      if (selected) list.reload()
    },
    filters: [
      {
        component: (
          <Combobox placeholder={filter.placeholder} options={filter.options} value={selected} onValueChange={setSelected} />
        ),
      },
      { component: <SortSelect options={orderingOptions} value={ordering} onChange={setOrdering} /> },
    ],
  }
}
