import type { Option } from "@/lib/types"
import { Combobox } from "./ComboBox"

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
  return <Combobox placeholder={placeholder} options={options} value={value} onValueChange={onChange} />
}
