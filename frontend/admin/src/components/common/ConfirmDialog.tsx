import { useId, useState, type ReactNode } from "react"
import { Loader2, Check, X } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface ConfirmDialogProps {
  /** Opens the dialog on click. Omit and pass `open`/`onOpenChange` to control it instead. */
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  confirmLabel?: ReactNode
  cancelLabel?: ReactNode
  destructive?: boolean
  /** Icon shown above the title (tinted red when `destructive`). */
  icon?: ReactNode
  /** Adds a free-text reason input; its trimmed value is passed to `onConfirm`. */
  reason?: { label?: string; placeholder?: string; required?: boolean }
  /** Extra fields between the description and the buttons. */
  children?: ReactNode
  /**
   * Runs on confirm. If it returns a promise the dialog stays open with a spinner until it
   * settles, then closes on success and stays open on failure (the caller reports the error).
   */
  onConfirm: (reason: string) => void | Promise<unknown>
  /** Disables the confirm button (e.g. while `children` fields are invalid). */
  confirmDisabled?: boolean
}

/** Confirm-before-acting dialog for deletes and workflow actions (cancel, void, reverse, unblock…). */
export function ConfirmDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  icon,
  reason,
  children,
  onConfirm,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [reasonText, setReasonText] = useState("")
  const [busy, setBusy] = useState(false)
  const reasonId = useId()
  const open = controlledOpen ?? uncontrolledOpen

  const setOpen = (next: boolean) => {
    if (busy) return
    if (!next) setReasonText("")
    setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  const confirm = async (e: React.MouseEvent) => {
    e.preventDefault()
    const result = onConfirm(reasonText.trim())
    if (!(result instanceof Promise)) {
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      await result
      setBusy(false)
      setOpen(false)
    } catch {
      setBusy(false)
    }
  }

  const missingReason = !!reason?.required && !reasonText.trim()

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent size={reason || children ? "default" : "sm"}>
        <AlertDialogHeader>
          {icon && (
            <AlertDialogMedia className={destructive ? "bg-destructive/10 text-destructive" : undefined}>
              {icon}
            </AlertDialogMedia>
          )}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>

        {reason && (
          <div className="space-y-2">
            <Label htmlFor={reasonId}>
              {reason.label ?? "Reason"}
              {!reason.required && <span className="font-normal text-muted-foreground"> (optional)</span>}
            </Label>
            <Input
              id={reasonId}
              value={reasonText}
              placeholder={reason.placeholder}
              onChange={(e) => setReasonText(e.target.value)}
            />
          </div>
        )}
        {children}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            <X className="size-4" />
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={busy || missingReason || confirmDisabled}
            onClick={confirm}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
