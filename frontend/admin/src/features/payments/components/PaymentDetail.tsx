import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"
import { CreditCard, Undo2, Wallet } from "lucide-react"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchPayment, refundPayment } from "@/features/payments/slices/paymentSlice"
import { paymentMethodLabel, type Payment } from "@/features/payments/types"
import { fetchOrderById } from "@/features/sales/slices/orderSlice"
import { KIND_PATHS, orderNoun } from "@/features/sales/shared/kindPaths"
import type { Order } from "@/features/sales/types"
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
import { useKindHint, useRecordKind } from "@/hooks/use-kind"
import { getApiErrorMessage } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { formatCurrency } from "@/lib/format"
import { fromPaisa, toPaisa } from "@/lib/money"

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

  const kind = payment?.order_type ?? "stock"
  const hint = useKindHint()
  useRecordKind(payment ? kind : undefined)
  // Only a pre-order has a deposit and a balance; they live on the order, not on the payment.
  const preorderId = kind === "preorder" ? payment?.order_id : undefined
  const [order, setOrder] = useState<Order | null>(null)
  useEffect(() => {
    if (!preorderId) return
    const request = dispatch(fetchOrderById(preorderId))
    request
      .unwrap()
      .then(setOrder)
      .catch(() => setOrder(null))
    return () => request.abort()
  }, [dispatch, preorderId])

  const pageState = resolveDetailState(singleStatus, singleError, !!payment)
  if (pageState || !payment) {
    return (
      <DetailPageState
        state={pageState ?? "loading"}
        entity="Payment"
        backTo={hint && KIND_PATHS[hint].payments}
        backLabel={hint === "preorder" ? "Back to pre-order payments" : "Back to payments"}
        error={singleError}
        onRetry={load}
      />
    )
  }

  const outstandingPaisa = toPaisa(payment.amount) - toPaisa(payment.refunded_amount)
  const outstanding = fromPaisa(outstandingPaisa)
  const refundable = canRefund && payment.status === "captured" && outstandingPaisa > 0

  // Blank = refund everything outstanding; otherwise 0 < amount ≤ outstanding.
  const amountPaisa = amount.trim() === "" ? outstandingPaisa : toPaisa(amount)
  const amountError =
    amount.trim() !== "" && (!(amountPaisa > 0) || amountPaisa > outstandingPaisa)
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
        back={{
          to: KIND_PATHS[kind].payments,
          label: kind === "preorder" ? "Back to pre-order payments" : "Back to payments",
        }}
        title={formatCurrency(payment.amount)}
        badges={<StatusBadge status={payment.status} />}
        description={
          <>
            Payment for {orderNoun(kind)}{" "}
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
          <DetailRow label={kind === "preorder" ? "Pre-order" : "Order"}>
            <Link to={`/order_detail/${payment.order_id}`} className="text-primary hover:underline">
              {payment.order_number}
            </Link>
          </DetailRow>
        </CardContent>
      </Card>

      {order && order.id === preorderId && (
        <Card className="max-w-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Deposit and balance
            </CardTitle>
            <CardDescription>All payments on pre-order {order.order_number} together.</CardDescription>
          </CardHeader>
          <CardContent>
            <DetailRow label="Pre-order total">{formatCurrency(order.grand_total)}</DetailRow>
            <DetailRow label="Deposit needed to confirm">{formatCurrency(order.deposit_due)}</DetailRow>
            <DetailRow label="Received so far">{formatCurrency(order.paid_total)}</DetailRow>
            <DetailRow label="Balance still owed">{formatCurrency(order.balance_due)}</DetailRow>
          </CardContent>
        </Card>
      )}

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
