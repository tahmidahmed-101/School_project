import type { ComponentProps, ReactNode } from "react"
import { Loader2, Save, type LucideIcon, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ButtonProps = ComponentProps<typeof Button>

/**
 * A button that shows a spinner in place of its icon, and disables itself, while `loading`.
 * Defaults to `type="submit"`; pass `type="button"` with an `onClick` for non-form actions.
 */
export function SubmitButton({
  loading = false,
  icon: Icon,
  disabled,
  type = "submit",
  children,
  ...props
}: ButtonProps & { loading?: boolean; icon?: LucideIcon }) {
  return (
    <Button type={type} disabled={loading || disabled} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" /> : null}
      {children}
    </Button>
  )
}

/** The Cancel / Save pair at the bottom of a full-page form. */
export function FormActions({
  onCancel,
  cancelLabel = "Cancel",
  submitLabel,
  submitting = false,
  submitDisabled = false,
  icon = Save,
  form,
  className,
}: {
  onCancel: () => void
  cancelLabel?: ReactNode
  submitLabel: ReactNode
  submitting?: boolean
  submitDisabled?: boolean
  icon?: LucideIcon
  /** Id of the <form> to submit, when the buttons sit outside it. */
  form?: string
  className?: string
}) {
  return (
    <div className={cn("flex justify-end gap-3", className)}>
      <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
        <X className="size-4" />
        {cancelLabel}
      </Button>
      <SubmitButton form={form} loading={submitting} disabled={submitDisabled} icon={icon}>
        {submitLabel}
      </SubmitButton>
    </div>
  )
}
