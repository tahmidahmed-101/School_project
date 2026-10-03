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

/**
 * The bar a full-page form's buttons sit in: pinned to the bottom of the page's scroll area,
 * so Save is always reachable however long the form is. Spans the page's side padding.
 */
export function StickyFormBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <>
      {/* On a page shorter than the screen this spacer takes the leftover height, which pushes
          the bar down to the bottom edge (the page stretches for it: see `.sticky-form-bar` in index.css). */}
      <div aria-hidden className="!mt-0 flex-1" />
      <div
        className={cn(
          // The negative bottom margin cancels the page's bottom padding, so the bar sits flush
          // with the bottom edge at the end of the page too, instead of gaining a gap underneath.
          "sticky-form-bar sticky bottom-0 z-10 -mx-4 -mb-5 mt-6 flex items-center justify-end gap-3 border-t border-border bg-muted px-4 py-3 md:-mx-6 md:-mb-6 md:px-6 dark:bg-background",
          className
        )}
      >
        {children}
      </div>
    </>
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
  sticky = false,
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
  /** Pin the buttons to the bottom of the page (see StickyFormBar). */
  sticky?: boolean
  className?: string
}) {
  const buttons = (
    <>
      <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
        <X className="size-4" /> {cancelLabel}
      </Button>
      <SubmitButton form={form} loading={submitting} disabled={submitDisabled} icon={icon}>
        {submitLabel}
      </SubmitButton>
    </>
  )
  if (sticky) return <StickyFormBar className={className}>{buttons}</StickyFormBar>
  return <div className={cn("flex justify-end gap-3", className)}>{buttons}</div>
}
