import type { Option } from "@/lib/types"
import { ExampleComboboxCustomItems } from "./ComboBox"

/** The "Sort" filter used in list toolbars. */
export function SortSelect({
  options,
  value,
  onChange,
  placeholder = "Sort",
}: {
  options: Option[]
  value: Option | null
  onChange: (value: Option | null) => void
  placeholder?: string
}) {
  return <ExampleComboboxCustomItems placeholder={placeholder} frameworks={options} value={value} onValueChange={onChange} />
}
