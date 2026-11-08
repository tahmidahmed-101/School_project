import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"
import { CreditCard, Undo2 } from "lucide-react"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchPayment, refundPayment } from "@/features/payments/slices/paymentSlice"
import { paymentMethodLabel, type Payment } from "@/features/payments/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DetailPageState } from "@/components/common/DetailPageState"
import { StatusBadge } from "@/components/common/StatusBadge"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { DetailRow } from "@/components/common/DetailRow"
import { PageHeader } from "@/components/common/PageHeader"
import { TextField } from "@/components/common/form-fields"
import { useCan } from "@/hooks/use-can"
import { useDetailLoad } from "@/hooks/use-detail-load"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { formatCurrency } from "@/lib/format"
import { fromPaisa, toPaisa } from "@/lib/money"
import { parseAmount } from "@/lib/moneyInput"

const PaymentDetail = () => {
  const { id } = useParams<{ id: string }>()
  const dispatch = useAppDispatch()
  const canRefund = useCan("refunds.approve")

  const { singleData, singleStatus, singleError } = useAppSelector((state) => state.payments)
  const payment = singleData && (singleData as Payment).id === id ? (singleData as Payment) : null

  useDocumentTitle(payment ? `Payment — ${payment.order_number}` : "Payment Details")

  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")

  const load = useDetailLoad(fetchPayment, id)

  const pageState = resolveDetailState(singleStatus, singleError, !!payment)
  if (pageState || !payment) {
    return (
      <DetailPageState
        state={pageState ?? "loading"}
        entity="Payment"
        backTo="/payments"
        backLabel="Back to payments"
        error={singleError}
        onRetry={load}
      />
    )
  }

  const outstandingPaisa = toPaisa(payment.amount) - toPaisa(payment.refunded_amount)
  const outstanding = fromPaisa(outstandingPaisa)
  const refundable = canRefund && payment.status === "captured" && outstandingPaisa > 0

  // Blank = refund everything outstanding; otherwise 0 < amount ≤ outstanding.
  const typedPaisa = parseAmount(amount)
  const amountPaisa = amount.trim() === "" ? outstandingPaisa : (typedPaisa ?? BigInt(0))
  const amountError =
    amount.trim() !== "" && (typedPaisa === null || !(amountPaisa > 0) || amountPaisa > outstandingPaisa)
      ? `Enter an amount between ${formatCurrency("0.01")} and ${formatCurrency(outstanding)}`
      : undefined

  // Rethrows so the dialog stays open on failure.
  const handleRefund = async () => {
    try {
      const partial = amount.trim() !== "" && amountPaisa < outstandingPaisa
      await dispatch(refundPayment({ id: payment.id, amount: partial ? fromPaisa(amountPaisa) : undefined })).unwrap()
      toast.success(`Refunded ${formatCurrency(fromPaisa(amountPaisa))}`)
      setAmount("")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Refund failed"))
      throw err
    }
  }

  return (
    <div className="section-container space-y-6">
      <PageHeader
        back={{ to: "/payments", label: "Back to payments" }}
        title={formatCurrency(payment.amount)}
        badges={<StatusBadge status={payment.status} />}
        description={
          <>
            Payment for order{" "}
            <Link to={`/order_detail/${payment.order_id}`} className="text-primary hover:underline">
              {payment.order_number}
            </Link>
          </>
        }
        actions={
          refundable && (
            <Button variant="outline" onClick={() => setOpen(true)}>
              <Undo2 className="size-4" />
              Refund
            </Button>
          )
        }
      />

      <Card className="max-w-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Payment
          </CardTitle>
          <CardDescription>Captured manually or by staff attestation — there is no live gateway.</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailRow label="Method">{paymentMethodLabel(payment.method)}</DetailRow>
          <DetailRow label="Amount">{formatCurrency(payment.amount)}</DetailRow>
          <DetailRow label="Refunded">{formatCurrency(payment.refunded_amount)}</DetailRow>
          <DetailRow label="Outstanding">{formatCurrency(outstanding)}</DetailRow>
          <DetailRow label="Reference">
            <span className="font-mono text-xs">{payment.gateway_reference || "—"}</span>
          </DetailRow>
          <DetailRow label="Order">
            <Link to={`/order_detail/${payment.order_id}`} className="text-primary hover:underline">
              {payment.order_number}
            </Link>
          </DetailRow>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        destructive
        title="Refund payment"
        description={`Up to ${formatCurrency(outstanding)} is still refundable. The payment is marked refunded once nothing is left outstanding.`}
        confirmLabel={amountError ? "Refund" : `Refund ${formatCurrency(fromPaisa(amountPaisa))}`}
        confirmDisabled={!!amountError}
        onConfirm={handleRefund}
      >
        <TextField
          label="Amount"
          id="refund-amount"
          type="number"
          step="0.01"
          min="0.01"
          max={outstanding}
          placeholder={outstanding}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          description="Leave blank to refund the full outstanding balance."
          error={amountError ? { message: amountError } : undefined}
        />
      </ConfirmDialog>
    </div>
  )
}

export default PaymentDetail
