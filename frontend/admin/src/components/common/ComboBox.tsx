import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"

type Framework = {
  label: string
  value: string
}

export function ExampleComboboxCustomItems({
  frameworks,
  placeholder,
  value,
  onValueChange,
}: {
  frameworks: Framework[]
  placeholder?: string
  value?: Framework | null
  onValueChange?: (value: Framework | null) => void
}) {
  return (
    <Combobox
      items={frameworks}
      itemToStringValue={(item: Framework) => item.label}
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
    </Combobox>
  )
}