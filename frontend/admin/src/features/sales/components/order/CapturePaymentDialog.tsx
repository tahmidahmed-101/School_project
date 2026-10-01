import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppDispatch } from "@/app/hooks"
import { capturePayment } from "@/features/sales/slices/orderSlice"
import type { Order } from "@/features/sales/types"
import { METHODS_WITHOUT_REFERENCE, PAYMENT_METHOD_OPTIONS, type PaymentMethod } from "@/features/payments/types"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format"

interface CapturePaymentDialogProps {
  order: Order
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Records a manually-attested payment for an order awaiting payment. The backend requires
 * the amount to equal the order's grand total, and a reference for gateway-less methods.
 */
function CapturePaymentDialogForm({ order, onOpenChange }: Omit<CapturePaymentDialogProps, "open">) {
  const dispatch = useAppDispatch()
  const [amount, setAmount] = useState(order.grand_total)
  const [method, setMethod] = useState<PaymentMethod>("manual")
  const [reference, setReference] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const needsReference = !METHODS_WITHOUT_REFERENCE.includes(method)
  const canSubmit = Number(amount) > 0 && (!needsReference || reference.trim().length > 0)

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await dispatch(
        capturePayment({ id: order.id, amount, method, reference: reference.trim() || undefined })
      ).unwrap()
      toast.success(`Payment of ${formatCurrency(amount)} captured`)
      onOpenChange(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to capture payment"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>Capture payment</DialogTitle>
          <DialogDescription>
            Record money received for {order.order_number}. The order moves to confirmed once captured.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="capture-amount">Amount</FieldLabel>
            <FieldContent>
              <Input
                id="capture-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <FieldDescription>Must equal the order total of {formatCurrency(order.grand_total)}.</FieldDescription>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="capture-method">Method</FieldLabel>
            <FieldContent>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger id="capture-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="capture-reference">Reference{needsReference ? " *" : ""}</FieldLabel>
            <FieldContent>
              <Input
                id="capture-reference"
                placeholder="TrxID, slip or statement reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
              {needsReference && (
                <FieldDescription>
                  Required — this method has no live gateway, so the reference is the proof money moved.
                </FieldDescription>
              )}
            </FieldContent>
          </Field>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Capture
          </Button>
        </DialogFooter>
    </>
  )
}

export function CapturePaymentDialog({ open, onOpenChange, ...props }: CapturePaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open && <CapturePaymentDialogForm onOpenChange={onOpenChange} {...props} />}
      </DialogContent>
    </Dialog>
  )
}
