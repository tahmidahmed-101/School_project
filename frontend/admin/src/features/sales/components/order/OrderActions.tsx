import { useState, type ComponentProps } from "react"
import { toast } from "sonner"
import { Ban, CheckCircle2, CreditCard, RotateCcw, Truck, type LucideIcon } from "lucide-react"

import { useAppDispatch } from "@/app/hooks"
import { cancelOrder, updateOrderStatus } from "@/features/sales/slices/orderSlice"
import { orderNoun } from "@/features/sales/shared/kindPaths"
import {
  NON_RETURNABLE_STATUSES,
  ORDER_STATUS_OPTIONS,
  PRE_SHIPMENT_STATUSES,
  type Order,
  type OrderStatus,
} from "@/features/sales/types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { SubmitButton } from "@/components/common/FormActions"
import { useCan } from "@/hooks/use-can"
import { getApiErrorMessage } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { CapturePaymentDialog } from "./CapturePaymentDialog"
import { CreateReturnDialog } from "./CreateReturnDialog"
import { CreateShipmentDialog } from "./CreateShipmentDialog"

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

const COPY = {
  stock: {
    captureHint: "Record money received for this order.",
    cancelDescription: "Stock holds are released. Cancelling never refunds money — refund captured payments separately.",
    cancelHint: "Release the stock; no refund is made.",
  },
  preorder: {
    captureHint: "Record a deposit or balance payment.",
    cancelDescription: "Cancelling never refunds money — refund the deposit and any other captured payment separately.",
    cancelHint: "No refund is made.",
  },
}

/** The manual status override (services/orders.py STATUS_OVERRIDES). Renders nothing when no move is allowed. */
export function OrderStatusChanger({ order }: { order: Order }) {
  const dispatch = useAppDispatch()
  const canManage = useCan("orders.manage")
  const [nextStatus, setNextStatus] = useState<OrderStatus | "">("")
  const [busy, setBusy] = useState(false)

  const statusOptions = ORDER_STATUS_OPTIONS.filter((o) => order.allowed_statuses.includes(o.value))
  if (!canManage || statusOptions.length === 0) return null

  const apply = async () => {
    if (!nextStatus) return
    const label = ORDER_STATUS_OPTIONS.find((o) => o.value === nextStatus)?.label ?? nextStatus
    setBusy(true)
    try {
      await dispatch(updateOrderStatus({ id: order.id, status: nextStatus })).unwrap()
      setNextStatus("")
      toast.success(`Status set to ${label.toLowerCase()}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update status"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Change status manually</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as OrderStatus)}>
          <SelectTrigger className="h-10 shrink-0 bg-card sm:flex-1" aria-label={`New ${orderNoun(order.order_type)} status`}>
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
          onClick={apply}
          disabled={!nextStatus}
          className="h-10"
        >
          Apply status
        </SubmitButton>
      </div>
    </div>
  )
}

/** One tile per thing staff can do now (capture, ship, return, cancel), with the dialogs behind them. */
export function OrderActions({ order, refresh }: { order: Order; refresh: () => void }) {
  const dispatch = useAppDispatch()
  const canManage = useCan("orders.manage")
  const canShip = useCan("shipments.update")
  const canReturn = useCan("returns.manage")
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<"capture" | "ship" | "return" | null>(null)

  const kind = order.order_type
  const noun = orderNoun(kind)
  const copy = COPY[kind]

  const canCancel = canManage && PRE_SHIPMENT_STATUSES.includes(order.status)
  // Cash on delivery is confirmed unpaid, so it stays capturable until the money is recorded.
  const canCapture =
    canManage &&
    order.status !== "cancelled" &&
    (order.status === "awaiting_payment" || order.payments.some((p) => p.status === "pending"))
  const canCreateShipment =
    canShip && order.status === "confirmed" && order.lines.some((l) => l.shippable_quantity > 0)
  const canCreateReturn =
    canReturn && !NON_RETURNABLE_STATUSES.includes(order.status) && order.lines.some((l) => l.returnable_quantity > 0)

  const handleCancel = async () => {
    setBusy(true)
    try {
      await dispatch(cancelOrder({ id: order.id })).unwrap()
      toast.success(`${kind === "preorder" ? "Pre-order" : "Order"} ${order.order_number} cancelled`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Failed to cancel ${noun}`))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">Actions</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {canCapture && (
          <ActionTile
            icon={CreditCard}
            title="Capture payment"
            hint={copy.captureHint}
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
            title={`Cancel ${noun} ${order.order_number}?`}
            description={copy.cancelDescription}
            confirmLabel={`Cancel ${noun}`}
            cancelLabel={`Keep ${noun}`}
            onConfirm={handleCancel}
            trigger={
              <ActionTile destructive icon={Ban} title={`Cancel ${noun}`} hint={copy.cancelHint} disabled={busy} />
            }
          />
        )}
      </div>
      {!canCapture && !canCreateShipment && !canCreateReturn && !canCancel && (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
          No further actions available for this {noun}.
        </p>
      )}

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
