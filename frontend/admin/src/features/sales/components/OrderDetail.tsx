import { useState, type ComponentProps } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Ban, Check, CheckCircle2, Clock, CreditCard, FileText, MapPin, PencilIcon, RotateCcw, Tag, Truck, User, Wallet, Eye, ListOrdered, ShieldAlert, Trash2, type LucideIcon } from "lucide-react"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import {
  cancelOrder,
  deleteData,
  fetchSingle,
  selectOrderDetail,
  updateOrderStatus,
  updatePreorderStage,
} from "@/features/sales/slices/orderSlice"
import {
  NON_RETURNABLE_STATUSES,
  ORDER_STATUS_OPTIONS,
  PREORDER_STAGE_OPTIONS,
  preorderStageLabel,
  PRE_SHIPMENT_STATUSES,
  type OrderStatus,
} from "@/features/sales/types"
import { paymentMethodLabel } from "@/features/payments/types"
import { ReturnOutcome } from "@/features/shipping/components/ReturnOutcome"
import { ShipmentActions } from "@/features/shipping/components/ShipmentActions"
import { RECEIVABLE_BACK_STATUSES } from "@/features/shipping/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DetailPageState } from "@/components/common/DetailPageState"
import { StatusBadge } from "@/components/common/StatusBadge"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { DetailRow } from "@/components/common/DetailRow"
import { PageHeader } from "@/components/common/PageHeader"
import { SubmitButton } from "@/components/common/FormActions"
import { downloadFile } from "@/lib/download"
import { useCan } from "@/hooks/use-can"
import { cn } from "@/lib/utils"
import { useDetailLoad } from "@/hooks/use-detail-load"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { formatCurrency, formatDateTime, humanize } from "@/lib/format"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { api } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import { useLastValue } from "@/hooks/use-dialog-presence"
import { OrderEditDialog } from "./order/OrderEditDialog"
import { CapturePaymentDialog } from "./order/CapturePaymentDialog"
import { CreateShipmentDialog } from "./order/CreateShipmentDialog"
import { CreateReturnDialog } from "./order/CreateReturnDialog"
import { OrderLinesCard } from "./order/OrderLinesCard"

/** POST /admin/risk/orders/{id}/assess/ — a fresh risk assessment of one order. */
interface RiskAssessment {
  risk_level: string
  risk_score: string
  risk_reasons: string[]
  recommended_action: string
  auto_blocked: boolean
  guidance: string
}

const PROGRESS_STEPS = ["Placed", "Confirmed", "Shipped", "Delivered"] as const

/** How many progress steps an order in this status has completed. */
function stepsDone(status: OrderStatus): number {
  switch (status) {
    case "confirmed":
      return 2
    case "shipped":
      return 3
    case "delivered":
    case "closed":
      return 4
    default:
      // pending, awaiting_payment
      return 1
  }
}

/** The order's journey as four steps; a cancelled order shows a notice instead. */
function OrderProgress({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm font-medium text-destructive">
        <Ban className="size-4 shrink-0" />
        This order was cancelled.
      </div>
    )
  }
  const done = stepsDone(status)
  return (
    <ol className="flex items-start" aria-label="Order progress">
      {PROGRESS_STEPS.map((label, i) => {
        const reached = i < done
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
            <div className="flex w-full items-center">
              {/* Connector to the previous step; the first step has none. */}
              <span className={cn("h-0.5 flex-1", i === 0 ? "invisible" : reached ? "bg-primary" : "bg-border")} />
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  reached
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground"
                )}
                aria-current={i === done - 1 ? "step" : undefined}
              >
                {reached ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "h-0.5 flex-1",
                  i === PROGRESS_STEPS.length - 1 ? "invisible" : i < done - 1 ? "bg-primary" : "bg-border"
                )}
              />
            </div>
            <span className={cn("truncate text-xs", reached ? "font-medium text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** A large button for one order action: icon, name and a line saying what it does. */
function ActionTile({
  icon: Icon,
  title,
  hint,
  destructive = false,
  className,
  ...props
}: ComponentProps<"button"> & { icon: LucideIcon; title: string; hint: string; destructive?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors disabled:pointer-events-none disabled:opacity-50",
        destructive
          ? "border-destructive/30 hover:bg-destructive/5"
          : "border-border hover:border-primary/40 hover:bg-muted/50",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-sm font-medium", destructive ? "text-destructive" : "text-foreground")}>
          {title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  )
}

const OrderDetail = () => {
  const { id } = useParams<{ id: string }>()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const singleData = useAppSelector(selectOrderDetail)
  const { singleStatus, singleError } = useAppSelector((state) => state.orders)
  const order = singleData && singleData.id === id ? singleData : null

  const canManage = useCan("orders.manage")
  const canShip = useCan("shipments.update")
  const canReturn = useCan("returns.manage")
  const canRefund = useCan("refunds.approve")
  const canAssessRisk = useCan("risk.manage")
  const [risk, setRisk] = useState<RiskAssessment | null>(null)
  const riskShown = useLastValue(risk)

  useDocumentTitle(order?.order_number ? `${order.order_number} — Order` : "Order Details")

  const [nextStatus, setNextStatus] = useState<OrderStatus | "">("")
  const [nextStage, setNextStage] = useState("")
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [dialog, setDialog] = useState<"edit" | "capture" | "ship" | "return" | null>(null)

  const refresh = useDetailLoad(fetchSingle, id)

  const pageState = resolveDetailState(singleStatus, singleError, !!order)
  if (pageState || !order) {
    return (
      <DetailPageState
        state={pageState ?? "loading"}
        entity="Order"
        backTo="/orders"
        backLabel="Back to Orders"
        error={singleError}
        onRetry={refresh}
      />
    )
  }

  const run = async (action: () => Promise<unknown>, success: string, failure: string) => {
    setBusy(true)
    try {
      await action()
      toast.success(success)
    } catch (err) {
      toast.error(getApiErrorMessage(err, failure))
    } finally {
      setBusy(false)
    }
  }

  const handleStage = () => {
    if (!nextStage) return
    return run(
      async () => {
        await dispatch(updatePreorderStage({ id: order.id, stage: nextStage })).unwrap()
        setNextStage("")
      },
      `Pre-order stage set to ${preorderStageLabel(nextStage).toLowerCase()}`,
      "Failed to update pre-order stage"
    )
  }

  const handleStatus = () => {
    if (!nextStatus) return
    const label = ORDER_STATUS_OPTIONS.find((o) => o.value === nextStatus)?.label ?? nextStatus
    return run(
      async () => {
        await dispatch(updateOrderStatus({ id: order.id, status: nextStatus })).unwrap()
        setNextStatus("")
      },
      `Order status set to ${label.toLowerCase()}`,
      "Failed to update status"
    )
  }

  const handleCancel = () =>
    run(() => dispatch(cancelOrder({ id: order.id })).unwrap(), `Order ${order.order_number} cancelled`, "Failed to cancel order")

  const handleDelete = async () => {
    try {
      await dispatch(deleteData(order.id)).unwrap()
      toast.success(`Order ${order.order_number} deleted`)
      navigate("/orders")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete order"))
    }
  }

  const handleRiskCheck = () =>
    run(
      async () => {
        const res = await api.post(`/admin/risk/orders/${order.id}/assess/`)
        setRisk(unwrapItem<RiskAssessment>(res.data))
      },
      "Risk check complete",
      "Risk check failed"
    )

  const handleInvoice = async () => {
    setDownloading(true)
    try {
      await downloadFile(`/admin/orders/${order.id}/invoice/`, `invoice-${order.order_number}.pdf`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to download invoice"))
    } finally {
      setDownloading(false)
    }
  }

  const isCancelled = order.status === "cancelled"
  const canCancel = canManage && PRE_SHIPMENT_STATUSES.includes(order.status)
  // Cash on delivery is confirmed unpaid, so it stays capturable until the money is recorded.
  const canCapture =
    canManage &&
    !isCancelled &&
    (order.status === "awaiting_payment" || order.payments.some((p) => p.status === "pending"))
  const statusOptions = ORDER_STATUS_OPTIONS.filter((o) => order.allowed_statuses.includes(o.value))
  const canCreateShipment =
    canShip && order.status === "confirmed" && order.lines.some((l) => l.shippable_quantity > 0)
  const canCreateReturn =
    canReturn && !NON_RETURNABLE_STATUSES.includes(order.status) && order.lines.some((l) => l.returnable_quantity > 0)
  const address = order.shipping_address

  return (
    <div className="section-container space-y-6">
      <PageHeader
        back={{ to: "/orders", label: "Back to orders" }}
        title={order.order_number}
        badges={<StatusBadge status={order.status} />}
        description={`Placed on ${formatDateTime(order.created_at)}`}
        actions={
          <>
            <SubmitButton type="button" loading={downloading} icon={FileText} variant="outline" onClick={handleInvoice}>
              Invoice PDF
            </SubmitButton>
            {canAssessRisk && (
              <Button variant="outline" onClick={handleRiskCheck} disabled={busy}>
                <ShieldAlert className="size-4" />
                Check risk
              </Button>
            )}
            {canManage && (
              <Button variant="outline" onClick={() => setDialog("edit")}>
                <PencilIcon className="size-4" />
                Edit details
              </Button>
            )}
            {canManage && (
              <ConfirmDialog
                destructive
                icon={<Trash2 />}
                title={`Delete order ${order.order_number}?`}
                description="This permanently removes the order together with its payments, shipments and returns, and releases any stock it holds. It can't be undone. To keep the record, cancel the order instead."
                confirmLabel="Delete order"
                cancelLabel="Keep order"
                onConfirm={handleDelete}
                trigger={
                  <Button variant="destructive">
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                }
              />
            )}
          </>
        }
      />

      {/* Actions + totals */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Totals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <DetailRow label="Subtotal">{formatCurrency(order.subtotal)}</DetailRow>
            <DetailRow label="Discount">
              <span className="text-green-600">−{formatCurrency(order.discount_total)}</span>
            </DetailRow>
            <DetailRow label="Shipping">{formatCurrency(order.shipping_total)}</DetailRow>
            <DetailRow label="Tax">{formatCurrency(order.tax_total)}</DetailRow>
            <Separator className="my-2" />
            <div className="flex items-center justify-between font-bold text-lg">
              <span>Grand total</span>
              <span className="text-primary">{formatCurrency(order.grand_total)}</span>
            </div>
            {order.coupon_code && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/10 bg-primary/5 p-2 text-xs">
                <Tag className="h-4 w-4 text-primary" />
                Coupon <span className="font-mono font-semibold">{order.coupon_code}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Status & actions
            </CardTitle>
            <CardDescription>
              {isCancelled
                ? "Cancelled orders can't be reopened — their stock holds are already released."
                : "Where the order stands, and what you can do with it next."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Where the order is on its way from placed to delivered. */}
            <OrderProgress status={order.status} />

            {canManage && statusOptions.length > 0 && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Change status manually</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as OrderStatus)}>
                    <SelectTrigger className="h-10 shrink-0 bg-card sm:flex-1" aria-label="New order status">
                      <SelectValue placeholder="Choose a status..." />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((o) => (
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
                    onClick={handleStatus}
                    disabled={!nextStatus}
                    className="h-10"
                  >
                    Apply status
                  </SubmitButton>
                </div>
              </div>
            )}

            {order.order_type === "preorder" && order.status !== "pending" && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">Pre-order stage</p>
                <p className="mt-0.5 text-sm font-semibold text-foreground">
                  {order.preorder_stage ? preorderStageLabel(order.preorder_stage) : "Not set yet"}
                </p>
                {canManage && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Select value={nextStage} onValueChange={setNextStage}>
                      <SelectTrigger className="h-10 shrink-0 bg-card sm:flex-1" aria-label="New pre-order stage">
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
                      onClick={handleStage}
                      disabled={!nextStage}
                      className="h-10"
                    >
                      Apply stage
                    </SubmitButton>
                  </div>
                )}
                {order.preorder_stage_events.length > 0 && (
                  <ol className="mt-3 space-y-1 border-t border-border pt-2">
                    {order.preorder_stage_events.map((event) => (
                      <li key={event.created_at} className="flex justify-between gap-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{preorderStageLabel(event.stage)}</span>
                        <span className="shrink-0">
                          {[formatDateTime(event.created_at), event.changed_by_name].filter(Boolean).join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            {/* One tile per thing staff can do now; each says what it does. */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Actions</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {canCapture && (
                  <ActionTile
                    icon={CreditCard}
                    title="Capture payment"
                    hint="Record money received for this order."
                    onClick={() => setDialog("capture")}
                    disabled={busy}
                  />
                )}
                {canCreateShipment && (
                  <ActionTile
                    icon={Truck}
                    title="Create shipment"
                    hint="Hand the items to a courier."
                    onClick={() => setDialog("ship")}
                    disabled={busy}
                  />
                )}
                {canCreateReturn && (
                  <ActionTile
                    icon={RotateCcw}
                    title="Create return"
                    hint="Take items back from the customer."
                    onClick={() => setDialog("return")}
                    disabled={busy}
                  />
                )}
                {canCancel && (
                  <ConfirmDialog
                    destructive
                    title={`Cancel order ${order.order_number}?`}
                    description="Stock holds are released. Cancelling never refunds money — refund captured payments separately."
                    confirmLabel="Cancel order"
                    cancelLabel="Keep order"
                    onConfirm={handleCancel}
                    trigger={
                      <ActionTile
                        destructive
                        icon={Ban}
                        title="Cancel order"
                        hint="Release the stock; no refund is made."
                        disabled={busy}
                      />
                    }
                  />
                )}
              </div>
              {!canCapture && !canCreateShipment && !canCreateReturn && !canCancel && (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                  No further actions available for this order.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer & ship-to */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <DetailRow label="Name">{order.customer_name || "—"}</DetailRow>
            <DetailRow label="Email">{order.customer_email || "—"}</DetailRow>
            <DetailRow label="Phone">{order.customer_phone || "—"}</DetailRow>
            {(order.contact_email || order.contact_phone) && (
              <p className="pt-1 text-xs text-muted-foreground">Contact details overridden on this order.</p>
            )}
            {order.notes && (
              <div className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-foreground">Notes</p>
                <p className="whitespace-pre-line text-xs text-muted-foreground">{order.notes}</p>
              </div>
            )}
            {/* A guest cart has no customer to list orders for. */}
            {order.customer_id && (
              <div className="pt-2">
                <Button variant="link" size="sm" className="px-0" asChild>
                  <Link to={`/orders?customer_id=${order.customer_id}`}><ListOrdered className="size-4" /> All orders from this customer</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Ship to
            </CardTitle>
          </CardHeader>
          <CardContent>
            {address ? (
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{address.full_name || "—"}</p>
                {address.phone && <p className="text-muted-foreground">{address.phone}</p>}
                <p>{address.line1}</p>
                <p className="text-muted-foreground">{[address.postal_code, address.country].filter(Boolean).join(", ")}</p>
                {address.delivery_note && (
                  <p className="mt-2 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">{address.delivery_note}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No shipping address on this order.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <OrderLinesCard order={order} canManage={canManage} />

      {/* Payments, shipments, returns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Payments ({order.payments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {order.payments.length === 0 && <p className="text-sm text-muted-foreground">No payments recorded.</p>}
            {order.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {formatCurrency(p.amount)} · {paymentMethodLabel(p.method)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.gateway_reference ? `Ref ${p.gateway_reference}` : "No reference"}
                    {Number(p.refunded_amount) > 0 && ` · Refunded ${formatCurrency(p.refunded_amount)}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={p.status} />
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/payment_detail/${p.id}`}>
                      <Eye className="size-4" />
                      {canRefund && p.status === "captured" ? "Refund" : "View"}
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              Shipments ({order.shipments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {order.shipments.length === 0 && <p className="text-sm text-muted-foreground">Nothing shipped yet.</p>}
            {order.shipments.map((s) => (
              <div key={s.id} className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/shipment_detail/${s.id}`} className="font-semibold hover:underline">
                      {s.carrier_name || "Carrier not set"}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Tracking <span className="font-mono">{s.tracking_number || "—"}</span>
                      {s.courier_status && ` · ${s.courier_status}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Charge {formatCurrency(s.shipping_charge)} · COD {formatCurrency(s.cod_amount)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={s.status} />
                    <ReturnOutcome shipment={s} />
                  </div>
                </div>
                {s.unresolved_damaged_quantity > 0 && (
                  <p role="alert" className="text-xs font-medium text-destructive">
                    {s.unresolved_damaged_quantity} damaged unit(s) written off and still owed to the customer —{" "}
                    <Link to={`/shipment_detail/${s.id}`} className="underline">
                      replace them
                    </Link>
                    .
                  </p>
                )}
                {RECEIVABLE_BACK_STATUSES.includes(s.status) && !s.received_back_at && (
                  <p className="text-xs text-muted-foreground">
                    Not yet received back.{" "}
                    <Link to={`/shipment_detail/${s.id}`} className="text-primary hover:underline">
                      Receive it back
                    </Link>{" "}
                    once the parcel arrives.
                  </p>
                )}
                <ShipmentActions shipment={s} onChanged={refresh} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-primary" />
            Returns ({order.rmas.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {order.rmas.length === 0 && <p className="text-sm text-muted-foreground">No returns for this order.</p>}
          {order.rmas.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">{r.rma_number}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.lines.reduce((n, l) => n + l.quantity, 0)} unit(s){r.reason ? ` · ${r.reason}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={r.status} />
                {canReturn && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/return_detail/${r.id}`}><Eye className="size-4" /> View</Link>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <OrderEditDialog order={order} open={dialog === "edit"} onOpenChange={(o) => setDialog(o ? "edit" : null)} />
      <CapturePaymentDialog
        order={order}
        open={dialog === "capture"}
        onOpenChange={(o) => setDialog(o ? "capture" : null)}
      />
      <CreateShipmentDialog
        order={order}
        open={dialog === "ship"}
        onOpenChange={(o) => setDialog(o ? "ship" : null)}
        onCreated={refresh}
      />
      <CreateReturnDialog
        order={order}
        open={dialog === "return"}
        onOpenChange={(o) => setDialog(o ? "return" : null)}
        onCreated={refresh}
      />

      <Dialog open={!!risk} onOpenChange={(open) => !open && setRisk(null)}>
        {riskShown && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                Risk check
                <StatusBadge
                  status={riskShown.risk_level}
                  tone={riskShown.risk_level === "low" ? "success" : riskShown.risk_level === "high" ? "destructive" : "warning"}
                />
              </DialogTitle>
              <DialogDescription>{riskShown.guidance}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p>
                Score <span className="font-semibold tabular-nums">{riskShown.risk_score}</span> · recommended:{" "}
                <span className="font-medium">{humanize(riskShown.recommended_action)}</span>
                {riskShown.auto_blocked && " · automatically blocked"}
              </p>
              {riskShown.risk_reasons.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  {riskShown.risk_reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No risk signals found.</p>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

export default OrderDetail
