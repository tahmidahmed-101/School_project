import { useState } from "react"

import { Combobox } from "@/components/common/ComboBox"
import { SortSelect } from "@/components/common/SortSelect"
import type { Kind } from "@/hooks/use-kind"
import { useListPage, type ListSliceState } from "@/hooks/use-list-page"
import type { Option } from "@/lib/types"

interface ModerationFilter {
  param: string
  placeholder: string
  options: Option[]
}

/**
 * Search, one or two filters and a sort order (the first is the default) for the reviews,
 * questions and price-report lists. Each list holds one kind only: stock products or pre-order
 * products.
 */
export function useModerationList({
  kind,
  fetch,
  state,
  filter,
  secondFilter,
  orderingOptions,
}: {
  kind: Kind
  fetch: Parameters<typeof useListPage>[0]["fetch"]
  state: ListSliceState
  filter: ModerationFilter
  secondFilter?: ModerationFilter
  orderingOptions: Option[]
}) {
  const [selected, setSelected] = useState<Option | null>(null)
  const [secondSelected, setSecondSelected] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(orderingOptions[0])

  const list = useListPage({
    fetch,
    state,
    params: {
      kind,
      [filter.param]: selected?.value,
      ...(secondFilter ? { [secondFilter.param]: secondSelected?.value } : {}),
      ordering: ordering?.value ?? orderingOptions[0].value,
    },
  })

  const anySelected = Boolean(selected || secondSelected)

  return {
    list,
    isFiltered: Boolean(list.debouncedSearch || anySelected),
    // With a filter on, a changed row may no longer belong in the list.
    reloadIfFiltered: () => {
      if (anySelected) list.reload()
    },
    filters: [
      {
        component: (
          <Combobox placeholder={filter.placeholder} options={filter.options} value={selected} onValueChange={setSelected} />
        ),
      },
      ...(secondFilter
        ? [
            {
              component: (
                <Combobox
                  placeholder={secondFilter.placeholder}
                  options={secondFilter.options}
                  value={secondSelected}
                  onValueChange={setSecondSelected}
                />
              ),
            },
          ]
        : []),
      { component: <SortSelect options={orderingOptions} value={ordering} onChange={setOrdering} /> },
    ],
  }
}
