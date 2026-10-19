import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form"
import {
  Combobox as ComboboxRoot,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CategoryOption } from "../lib/useCategoryOptions"

/** Category picker for a form field; options are indented by depth so the list reads as a tree. */
export function CategoryTreeSelect<T extends FieldValues>({
  control,
  name,
  id,
  options,
  placeholder,
  none,
}: {
  control: Control<T>
  name: FieldPath<T>
  id?: string
  options: CategoryOption[]
  placeholder?: string
  /** An extra first choice, e.g. "None (root category)". */
  none?: { value: string; label: string }
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {none && <SelectItem value={none.value}>{none.label}</SelectItem>}
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {"  ".repeat(o.depth)}
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  )
}

/** What the searchable picker reads from an option; a full CategoryOption fits. */
type TreeOption = Pick<CategoryOption, "label" | "value" | "depth">

/** The same picker with a search box: type to narrow the list, which stays indented by depth. */
export function CategoryTreeCombobox<T extends FieldValues>({
  control,
  name,
  id,
  options,
  placeholder,
  disabled,
}: {
  control: Control<T>
  name: FieldPath<T>
  id?: string
  options: TreeOption[]
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <ComboboxRoot
          items={options}
          itemToStringValue={(item: TreeOption) => item.label}
          value={options.find((o) => o.value === field.value) ?? null}
          onValueChange={(option: TreeOption | null) => field.onChange(option?.value ?? "")}
        >
          <ComboboxInput id={id} placeholder={placeholder} showClear={!disabled} disabled={disabled} />
          <ComboboxContent>
            <ComboboxEmpty>No categories found.</ComboboxEmpty>
            <ComboboxList>
              {(item: TreeOption) => (
                <ComboboxItem key={item.value} value={item}>
                  <span style={{ paddingLeft: `${item.depth * 0.75}rem` }}>{item.label}</span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </ComboboxRoot>
      )}
    />
  )
}
