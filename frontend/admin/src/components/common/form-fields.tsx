import { useId, type ComponentProps, type ReactNode } from "react"
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form"

import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getDefaultCurrency } from "@/lib/format"
import type { Option } from "@/lib/types"

type FieldErrorLike = { message?: string } | undefined

interface FormFieldProps {
  label: ReactNode
  /** Id of the control the label points at. */
  htmlFor?: string
  /** Help text under the control. */
  description?: ReactNode
  /** Usually `errors.<name>` from react-hook-form. */
  error?: FieldErrorLike
  /** Class for the field wrapper, e.g. a grid column span. */
  className?: string
  children: ReactNode
}

/** Label + control + help text + error: the layout every form field shares. */
export function FormField({ label, htmlFor, description, error, className, children }: FormFieldProps) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      <FieldContent>
        {children}
        {description && <FieldDescription>{description}</FieldDescription>}
        <FieldError errors={[error]} />
      </FieldContent>
    </Field>
  )
}

type SharedProps = Pick<FormFieldProps, "label" | "description" | "error"> & {
  /** Class for the field wrapper; use `inputClassName` to style the control itself. */
  className?: string
  inputClassName?: string
}

/**
 * A labelled text input. Takes every <Input> prop, so it works with react-hook-form
 * (`{...register("name")}`) and with plain `value` / `onChange` state alike.
 */
export function TextField({
  label,
  description,
  error,
  className,
  inputClassName,
  id,
  ...props
}: SharedProps & Omit<ComponentProps<typeof Input>, "className">) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FormField label={label} htmlFor={inputId} description={description} error={error} className={className}>
      <Input id={inputId} aria-invalid={error ? true : undefined} className={inputClassName} {...props} />
    </FormField>
  )
}

/** A labelled amount input; pair it with `moneySchema` from `@/lib/forms`. `showCurrency` adds the shop currency to the label. */
export function MoneyField({
  showCurrency = false,
  label,
  ...props
}: ComponentProps<typeof TextField> & { showCurrency?: boolean }) {
  return (
    <TextField
      inputMode="decimal"
      label={showCurrency ? <>{label} ({getDefaultCurrency()})</> : label}
      {...props}
    />
  )
}

/** A labelled calendar-day input ("YYYY-MM-DD"), or date + time with `withTime`. */
export function DateField({ withTime = false, ...props }: ComponentProps<typeof TextField> & { withTime?: boolean }) {
  return <TextField type={withTime ? "datetime-local" : "date"} {...props} />
}

/** A labelled multi-line text input. */
export function TextareaField({
  label,
  description,
  error,
  className,
  inputClassName,
  id,
  ...props
}: SharedProps & Omit<ComponentProps<typeof Textarea>, "className">) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <FormField label={label} htmlFor={inputId} description={description} error={error} className={className}>
      <Textarea id={inputId} aria-invalid={error ? true : undefined} className={inputClassName} {...props} />
    </FormField>
  )
}

/** A labelled dropdown bound to a react-hook-form field; its error comes from the form state. */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  placeholder,
  description,
  disabled,
  className,
  id,
}: {
  control: Control<T>
  name: FieldPath<T>
  label: ReactNode
  options: Option[]
  placeholder?: string
  description?: ReactNode
  disabled?: boolean
  className?: string
  id?: string
}) {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField
          label={label}
          htmlFor={selectId}
          description={description}
          error={fieldState.error}
          className={className}
        >
          <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
            <SelectTrigger id={selectId} className="w-full" aria-invalid={fieldState.error ? true : undefined}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}
    />
  )
}
