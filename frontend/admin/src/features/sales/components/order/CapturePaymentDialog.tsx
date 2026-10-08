import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import { FormDialog } from "@/components/common/FormDialog"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TextField } from "@/components/common/form-fields"
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
export function CapturePaymentDialog({ order, open, onOpenChange }: CapturePaymentDialogProps) {
  const dispatch = useAppDispatch()
  const [amount, setAmount] = useState(order.grand_total)
  // An order placed on the storefront already names how the customer chose to pay.
  const owedMethod: PaymentMethod = order.payments.find((p) => p.status === "pending")?.method ?? "manual"
  const [method, setMethod] = useState<PaymentMethod>(owedMethod)
  const [reference, setReference] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Start from a clean form each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setAmount(order.grand_total)
      setMethod(owedMethod)
      setReference("")
    }
  }

  const needsReference = !METHODS_WITHOUT_REFERENCE.includes(method)
  const canSubmit = Number(amount) > 0 && (!needsReference || reference.trim().length > 0)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Capture payment"
      description={
        order.status === "awaiting_payment"
          ? `Record money received for ${order.order_number}. The order moves to confirmed once captured.`
          : `Record money received for ${order.order_number}.`
      }
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Capture"
      submitDisabled={!canSubmit}
    >
      <TextField
        label="Amount"
        id="capture-amount"
        type="number"
        step="0.01"
        min="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        description={<>Must equal the order total of {formatCurrency(order.grand_total)}.</>}
      />
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
    </FormDialog>
  )
}
