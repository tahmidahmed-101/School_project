import { useState } from "react"
import { toast } from "sonner"
import { CalendarClock, CheckCircle2, Clock, Wallet } from "lucide-react"

import { useAppDispatch } from "@/app/hooks"
import { updatePreorderStage } from "@/features/sales/slices/orderSlice"
import { PREORDER_STAGE_OPTIONS, preorderStageLabel, type Order } from "@/features/sales/types"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { DetailRow } from "@/components/common/DetailRow"
import { SubmitButton } from "@/components/common/FormActions"
import { useCan } from "@/hooks/use-can"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { OrderActions, OrderStatusChanger } from "./OrderActions"
import { OrderHeader } from "./OrderHeader"
import { OrderLinesCard } from "./OrderLinesCard"
import { CancelledNotice } from "./OrderProgress"
import { OrderCustomerCard, OrderRecords } from "./OrderRecords"

/** Where the pre-order is on its way from the supplier; staff move it by hand. */
function StageCard({ order, canManage }: { order: Order; canManage: boolean }) {
  const dispatch = useAppDispatch()
  const [nextStage, setNextStage] = useState("")
  const [busy, setBusy] = useState(false)

  const apply = async () => {
    if (!nextStage) return
    setBusy(true)
    try {
      await dispatch(updatePreorderStage({ id: order.id, stage: nextStage })).unwrap()
      toast.success(`Stage set to ${preorderStageLabel(nextStage).toLowerCase()}`)
      setNextStage("")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update the stage"))
    } finally {
      setBusy(false)
    }
  }

  // The stage endpoint only takes a pre-order that has been placed.
  const placed = order.status !== "pending"

  return (
    <Card className="md:col-span-2 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          Stage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {order.status === "cancelled" && <CancelledNotice>This pre-order was cancelled.</CancelledNotice>}
        <p className="text-lg font-bold text-foreground">
          {order.preorder_stage ? preorderStageLabel(order.preorder_stage) : "Not set yet"}
        </p>

        {canManage && placed && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={nextStage} onValueChange={setNextStage}>
              <SelectTrigger className="h-10 shrink-0 bg-card sm:flex-1" aria-label="New stage">
                <SelectValue placeholder="Choose a stage..." />
              </SelectTrigger>
              <SelectContent>
                {PREORDER_STAGE_OPTIONS.filter((o) => o.value !== order.preorder_stage).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SubmitButton
              type="button"
              loading={busy}
              icon={CheckCircle2}
              onClick={apply}
              disabled={!nextStage}
              className="h-10"
            >
              Apply stage
            </SubmitButton>
          </div>
        )}

        {order.preorder_stage_events.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Stage history</p>
            <ol className="space-y-1 border-t border-border pt-2">
              {order.preorder_stage_events.map((event) => (
                <li key={event.created_at} className="flex justify-between gap-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {preorderStageLabel(event.stage)}
                    {event.note && <span className="font-normal text-muted-foreground"> — {event.note}</span>}
                  </span>
                  <span className="shrink-0">
                    {[formatDateTime(event.created_at), event.changed_by_name].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MoneyCard({ order }: { order: Order }) {
  return (
    <Card className="md:col-span-1 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          Deposit and balance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <DetailRow label="Deposit needed to confirm">{formatCurrency(order.deposit_due)}</DetailRow>
        <DetailRow label="Received so far">{formatCurrency(order.paid_total)}</DetailRow>
        <div className="flex items-center justify-between font-bold text-lg">
          <span>Balance still owed</span>
          <span className="text-primary">{formatCurrency(order.balance_due)}</span>
        </div>
        <Separator className="my-2" />
        <DetailRow label="Items">{formatCurrency(order.subtotal)}</DetailRow>
        <DetailRow label="Shipping">{formatCurrency(order.shipping_total)}</DetailRow>
        <DetailRow label="Tax">{formatCurrency(order.tax_total)}</DetailRow>
        {Number(order.discount_total) > 0 && (
          <DetailRow label="Discount">−{formatCurrency(order.discount_total)}</DetailRow>
        )}
        <DetailRow label="Pre-order total">
          <span className="font-semibold">{formatCurrency(order.grand_total)}</span>
        </DetailRow>
      </CardContent>
    </Card>
  )
}

/** A pre-order: its stage and deposit first, then status, lines waiting for arrival, records. */
export function PreorderOrderDetail({ order, refresh }: { order: Order; refresh: () => void }) {
  const canManage = useCan("orders.manage")
  return (
    <div className="section-container space-y-6">
      <OrderHeader order={order} badges={<Badge variant="secondary">Pre-order</Badge>} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <MoneyCard order={order} />
        <StageCard order={order} canManage={canManage} />
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Status & actions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <OrderStatusChanger order={order} />
          <OrderActions order={order} refresh={refresh} />
        </CardContent>
      </Card>

      <OrderLinesCard order={order} canManage={canManage} />
      <OrderCustomerCard order={order} />
      <OrderRecords order={order} refresh={refresh} />
    </div>
  )
}
