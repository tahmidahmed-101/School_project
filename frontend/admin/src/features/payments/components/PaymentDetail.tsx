import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, CreditCard, Loader2, Undo2 } from "lucide-react"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchPayment, refundPayment } from "@/features/payments/slices/paymentSlice"
import { paymentMethodLabel, type Payment } from "@/features/payments/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { DetailPageState } from "@/components/common/DetailPageState"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useCan } from "@/features/sales/shared/useCan"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { formatCurrency } from "@/lib/format"

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex justify-between gap-4 border-b border-border/50 py-2 text-sm last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{children}</span>
  </div>
)

// Decimal-string money math in integer paisa, so 0.1 + 0.2 style drift can't creep in.
const toPaisa = (v: string) => Math.round(Number(v) * 100)

const PaymentDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canRefund = useCan("refunds.approve")

  const { singleData, singleStatus, singleError } = useAppSelector((state) => state.payments)
  const payment = singleData && (singleData as Payment).id === id ? (singleData as Payment) : null

  useDocumentTitle(payment ? `Payment — ${payment.order_number}` : "Payment Details")

  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(() => (id ? dispatch(fetchPayment(id)) : undefined), [dispatch, id])
  useEffect(() => {
    const request = load()
    return () => request?.abort()
  }, [load])

  const pageState = resolveDetailState(singleStatus, singleError, !!payment)
  if (pageState || !payment) {
    return (
      <DetailPageState
        state={pageState ?? "loading"}
        entity="Payment"
        backTo="/payments"
        backLabel="Back to Payments"
        error={singleError}
        onRetry={() => {
          load()
        }}
      />
    )
  }

  const outstandingPaisa = toPaisa(payment.amount) - toPaisa(payment.refunded_amount)
  const outstanding = (outstandingPaisa / 100).toFixed(2)
  const refundable = canRefund && payment.status === "captured" && outstandingPaisa > 0

  // Blank = refund everything outstanding; otherwise 0 < amount ≤ outstanding.
  const amountPaisa = amount.trim() === "" ? outstandingPaisa : toPaisa(amount)
  const amountError =
    amount.trim() !== "" && (!(amountPaisa > 0) || amountPaisa > outstandingPaisa)
      ? `Enter an amount between ${formatCurrency("0.01")} and ${formatCurrency(outstanding)}`
      : undefined

  const handleRefund = async () => {
    setSubmitting(true)
    try {
      const partial = amount.trim() !== "" && amountPaisa < outstandingPaisa
      await dispatch(refundPayment({ id: payment.id, amount: partial ? (amountPaisa / 100).toFixed(2) : undefined })).unwrap()
      toast.success(`Refunded ${formatCurrency(amountPaisa / 100)}`)
      setOpen(false)
      setAmount("")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Refund failed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="section-container space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="back" size="icon" onClick={() => navigate("/payments")} aria-label="Back to payments">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{formatCurrency(payment.amount)}</h1>
              <StatusBadge status={payment.status} />
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              Payment for{" "}
              <Link to={`/order_detail/${payment.order_id}`} className="text-primary hover:underline">
                {payment.order_number}
              </Link>
            </p>
          </div>
        </div>
        {refundable && (
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Undo2 className="size-4" />
            Refund
          </Button>
        )}
      </div>

      <Card className="max-w-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Payment
          </CardTitle>
          <CardDescription>Captured manually or by staff attestation — there is no live gateway.</CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="Method">{paymentMethodLabel(payment.method)}</Row>
          <Row label="Amount">{formatCurrency(payment.amount)}</Row>
          <Row label="Refunded">{formatCurrency(payment.refunded_amount)}</Row>
          <Row label="Outstanding">{formatCurrency(outstanding)}</Row>
          <Row label="Reference">
            <span className="font-mono text-xs">{payment.gateway_reference || "—"}</span>
          </Row>
          <Row label="Order">
            <Link to={`/order_detail/${payment.order_id}`} className="text-primary hover:underline">
              {payment.order_number}
            </Link>
          </Row>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Refund payment</DialogTitle>
            <DialogDescription>
              Up to {formatCurrency(outstanding)} is still refundable. The payment is marked refunded once nothing is
              left outstanding.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="refund-amount">Amount</FieldLabel>
            <FieldContent>
              <Input
                id="refund-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={outstanding}
                placeholder={outstanding}
                value={amount}
                aria-invalid={!!amountError}
                onChange={(e) => setAmount(e.target.value)}
              />
              <FieldDescription>Leave blank to refund the full outstanding balance.</FieldDescription>
              <FieldError errors={[amountError ? { message: amountError } : undefined]} />
            </FieldContent>
          </Field>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRefund} disabled={!!amountError || submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {amountError ? "Refund" : `Refund ${formatCurrency(amountPaisa / 100)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default PaymentDetail
