import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form"
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
