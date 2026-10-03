import {
  Combobox as ComboboxRoot,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import type { Option } from "@/lib/types"

/** Searchable, clearable single-choice dropdown used for list filters. */
export function Combobox({
  options,
  placeholder,
  value,
  onValueChange,
}: {
  options: Option[]
  placeholder?: string
  value?: Option | null
  onValueChange?: (value: Option | null) => void
}) {
  return (
    <ComboboxRoot
      items={options}
      itemToStringValue={(item: Option) => item.label}
      value={value}
      onValueChange={onValueChange}
    >
      <ComboboxInput placeholder={placeholder} showClear />
      <ComboboxContent>
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </ComboboxRoot>
  )
}
