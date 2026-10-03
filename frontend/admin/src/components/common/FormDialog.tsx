import { useId, type FormEventHandler, type ReactNode } from "react"
import { X, Check } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Field, FieldDescription } from "@/components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SubmitButton } from "@/components/common/FormActions"
import { cn } from "@/lib/utils"

const SIZE_CLASS = {
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  "2xl": "sm:max-w-3xl",
  xl: "sm:max-w-4xl",
} as const

export interface FormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Usually react-hook-form's `handleSubmit(onSubmit)`. */
  onSubmit: FormEventHandler<HTMLFormElement>
  submitting?: boolean
  submitLabel: ReactNode
  submitDisabled?: boolean
  /** Red submit button, for forms that remove or write off something. */
  destructive?: boolean
  size?: keyof typeof SIZE_CLASS
  /** Shown above the buttons, e.g. a form-level error. */
  footerNote?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Create/edit dialog shell: header, a scrollable form body (long forms never run off screen)
 * and a Cancel / Submit footer with a spinner while submitting.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitting = false,
  submitLabel,
  submitDisabled = false,
  destructive = false,
  size = "md",
  footerNote,
  children,
  className,
}: FormDialogProps) {
  const formId = useId()
  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", SIZE_CLASS[size], className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form id={formId} onSubmit={onSubmit} noValidate className="space-y-4 py-2">
          {children}
        </form>
        {footerNote}
        <DialogActions
          onCancel={() => onOpenChange(false)}
          form={formId}
          submitLabel={submitLabel}
          submitting={submitting}
          submitDisabled={submitDisabled}
          destructive={destructive}
        />
      </DialogContent>
    </Dialog>
  )
}

/**
 * The Cancel / action pair at the bottom of a dialog. Submits the form named by `form`,
 * or calls `onSubmit` for dialogs that are not built around a <form>.
 */
export function DialogActions({
  onCancel,
  cancelLabel = "Cancel",
  submitLabel,
  submitting = false,
  submitDisabled = false,
  destructive = false,
  icon = Check,
  form,
  onSubmit,
}: {
  onCancel: () => void
  cancelLabel?: ReactNode
  submitLabel: ReactNode
  submitting?: boolean
  submitDisabled?: boolean
  destructive?: boolean
  icon?: LucideIcon
  form?: string
  onSubmit?: () => void
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
        <X className="size-4" />
        {cancelLabel}
      </Button>
      <SubmitButton
        type={onSubmit ? "button" : "submit"}
        form={form}
        onClick={onSubmit}
        loading={submitting}
        disabled={submitDisabled}
        icon={icon}
        variant={destructive ? "destructive" : "default"}
      >
        {submitLabel}
      </SubmitButton>
    </DialogFooter>
  )
}

/** A boolean form field rendered as a switch with a label (and optional help text). */
export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
}: {
  control: Control<T>
  name: FieldPath<T>
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field>
          <div className="flex items-center gap-3">
            <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} disabled={disabled} />
            <label htmlFor={id} className="text-sm">
              {label}
            </label>
          </div>
          {description && <FieldDescription>{description}</FieldDescription>}
        </Field>
      )}
    />
  )
}
