import { useMemo, useState } from "react"

import type { Product, ProductOption } from "../types"
import {
  buildCombinations,
  combinationKey,
  optionProblems,
  optionsChanged,
  type OptionDraft,
} from "./options"

let lastKey = 0
export const newOptionKey = () => `option-${(lastKey += 1)}`

const toDrafts = (options: ProductOption[]): OptionDraft[] =>
  options.map((o) => ({
    key: o.id,
    id: o.id,
    name: o.name,
    values: o.values.map((v) => ({ id: v.id, value: v.value })),
    default_value: "",
  }))

export const savedOptionsOf = (product: Product | null): ProductOption[] =>
  Array.isArray(product?.options) ? product.options : []

/** The options being edited on a product form, and (new product) which combinations stay ticked. */
export function useOptionDrafts(product: Product | null) {
  const [saved] = useState(() => savedOptionsOf(product))
  const [enabled, setEnabled] = useState(saved.length > 0)
  const [drafts, setDrafts] = useState<OptionDraft[]>(() => toDrafts(saved))
  const [checked, setChecked] = useState(false)
  const [unticked, setUnticked] = useState<string[]>([])

  const needsDefault = (product?.variants.length ?? 0) > 0
  const active = useMemo(() => (enabled ? drafts : []), [enabled, drafts])
  const combinations = useMemo(() => buildCombinations(active.map((o) => o.values.map((v) => v.value))), [active])
  const ticked = combinations.filter((c) => !unticked.includes(combinationKey(c)))

  const problems = checked ? optionProblems(active, needsDefault) : {}
  const emptyProblem = checked && enabled && drafts.length === 0 ? "Add an option, or switch options off." : ""

  /** Shows what is wrong from now on; false when the options cannot be saved yet. */
  const check = () => {
    setChecked(true)
    return !(enabled && drafts.length === 0) && Object.keys(optionProblems(active, needsDefault)).length === 0
  }

  return {
    enabled,
    setEnabled: (next: boolean) => {
      setEnabled(next)
      if (next && drafts.length === 0) {
        setDrafts([{ key: newOptionKey(), name: "", values: [], default_value: "" }])
      }
    },
    drafts,
    setDrafts,
    active,
    needsDefault,
    usedValueIds: useMemo(
      () => new Set((product?.variants ?? []).flatMap((v) => (v.option_values ?? []).map((ov) => ov.value_id))),
      [product]
    ),
    problems,
    emptyProblem,
    check,
    changed: optionsChanged(saved, active),
    hadOptions: saved.length > 0,
    combinations,
    ticked,
    toggleCombination: (key: string) =>
      setUnticked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])),
  }
}

export type OptionDraftState = ReturnType<typeof useOptionDrafts>
