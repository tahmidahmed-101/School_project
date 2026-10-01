import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Loader2,
  MapPin,
  PencilIcon,
  RotateCcw,
  Tag,
  Truck,
  User,
  Wallet,
} from "lucide-react"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { cancelOrder, fetchSingle, selectOrderDetail, updateOrderStatus } from "@/features/sales/slices/orderSlice"
import {
  NON_RETURNABLE_STATUSES,
  ORDER_STATUS_OPTIONS,
  PRE_SHIPMENT_STATUSES,
  type OrderStatus,
} from "@/features/sales/types"
import { paymentMethodLabel } from "@/features/payments/types"
import { ShipmentActions } from "@/features/shipping/components/ShipmentActions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DetailPageState } from "@/components/common/DetailPageState"
import { StatusBadge } from "@/components/common/StatusBadge"
import { ConfirmAction } from "@/features/sales/shared/ConfirmAction"
import { downloadFile } from "@/features/sales/shared/download"
import { useCan } from "@/features/sales/shared/useCan"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { OrderEditDialog } from "./order/OrderEditDialog"
import { CapturePaymentDialog } from "./order/CapturePaymentDialog"
import { CreateShipmentDialog } from "./order/CreateShipmentDialog"
import { CreateReturnDialog } from "./order/CreateReturnDialog"
import { OrderLinesCard } from "./order/OrderLinesCard"

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex justify-between gap-4 py-1 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-medium">{children}</span>
  </div>
)

const OrderDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()

  const singleData = useAppSelector(selectOrderDetail)
  const { singleStatus, singleError } = useAppSelector((state) => state.orders)
  const order = singleData && singleData.id === id ? singleData : null

  const canManage = useCan("orders.manage")
  const canShip = useCan("shipments.update")
  const canReturn = useCan("returns.manage")
  const canRefund = useCan("refunds.approve")

  useDocumentTitle(order?.order_number ? `${order.order_number} — Order` : "Order Details")

  const [nextStatus, setNextStatus] = useState<OrderStatus | "">("")
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [dialog, setDialog] = useState<"edit" | "capture" | "ship" | "return" | null>(null)

  const load = useCallback(() => (id ? dispatch(fetchSingle(id)) : undefined), [dispatch, id])

  useEffect(() => {
    const request = load()
    return () => request?.abort()
  }, [load])

  const refresh = () => {
    load()
  }

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
  const canCapture = canManage && order.status === "awaiting_payment"
  const canCreateShipment =
    canShip && order.status === "confirmed" && order.lines.some((l) => l.shippable_quantity > 0)
  const canCreateReturn =
    canReturn && !NON_RETURNABLE_STATUSES.includes(order.status) && order.lines.some((l) => l.returnable_quantity > 0)
  const address = order.shipping_address

  return (
    <div className="section-container space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="back" size="icon" onClick={() => navigate("/orders")} aria-label="Back to orders">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{order.order_number}</h1>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">Placed on {formatDateTime(order.created_at)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleInvoice} disabled={downloading}>
            {downloading ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            Invoice PDF
          </Button>
          {canManage && (
            <Button variant="outline" onClick={() => setDialog("edit")}>
              <PencilIcon className="size-4" />
              Edit details
            </Button>
          )}
        </div>
      </div>

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
            <Row label="Subtotal">{formatCurrency(order.subtotal)}</Row>
            <Row label="Discount">
              <span className="text-green-600">−{formatCurrency(order.discount_total)}</span>
            </Row>
            <Row label="Shipping">{formatCurrency(order.shipping_total)}</Row>
            <Row label="Tax">{formatCurrency(order.tax_total)}</Row>
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
                : "Override the status, take payment, ship or open a return."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManage && !isCancelled && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as OrderStatus)}>
                  <SelectTrigger className="flex-1" aria-label="New order status">
                    <SelectValue placeholder="Change order status..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUS_OPTIONS.filter((o) => o.value !== order.status).map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleStatus} disabled={!nextStatus || busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Apply status
                </Button>
              </div>
            )}

            <div className="flex flex-wrap gap-3 border-t border-border/50 pt-3">
              {canCapture && (
                <Button variant="outline" size="sm" onClick={() => setDialog("capture")} disabled={busy}>
                  <CreditCard className="h-4 w-4" />
                  Capture payment
                </Button>
              )}
              {canCreateShipment && (
                <Button variant="outline" size="sm" onClick={() => setDialog("ship")} disabled={busy}>
                  <Truck className="h-4 w-4" />
                  Create shipment
                </Button>
              )}
              {canCreateReturn && (
                <Button variant="outline" size="sm" onClick={() => setDialog("return")} disabled={busy}>
                  <RotateCcw className="h-4 w-4" />
                  Create return
                </Button>
              )}
              {canCancel && (
                <ConfirmAction
                  destructive
                  title={`Cancel order ${order.order_number}?`}
                  description="Stock holds are released. Cancelling never refunds money — refund captured payments separately."
                  confirmLabel="Cancel order"
                  cancelLabel="Keep order"
                  onConfirm={handleCancel}
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={busy}
                    >
                      <Ban className="h-4 w-4" />
                      Cancel order
                    </Button>
                  }
                />
              )}
              {!canCapture && !canCreateShipment && !canCreateReturn && !canCancel && (
                <p className="text-sm text-muted-foreground">No further actions available for this order.</p>
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
            <Row label="Name">{order.customer_name || "—"}</Row>
            <Row label="Email">{order.customer_email || "—"}</Row>
            <Row label="Phone">{order.customer_phone || "—"}</Row>
            {(order.contact_email || order.contact_phone) && (
              <p className="pt-1 text-xs text-muted-foreground">Contact details overridden on this order.</p>
            )}
            {order.notes && (
              <div className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-foreground">Notes</p>
                <p className="whitespace-pre-line text-xs text-muted-foreground">{order.notes}</p>
              </div>
            )}
            <div className="pt-2">
              <Button variant="link" size="sm" className="px-0" asChild>
                <Link to={`/orders?customer_id=${order.customer_id}`}>All orders from this customer</Link>
              </Button>
            </div>
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
                  <StatusBadge status={s.status} />
                </div>
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
                    <Link to={`/return_detail/${r.id}`}>View</Link>
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
    </div>
  )
}

export default OrderDetail
