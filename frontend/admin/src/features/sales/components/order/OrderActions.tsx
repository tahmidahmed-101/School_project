import { useState } from "react"
import { toast } from "sonner"
import { Ban, CreditCard, ListChecks, RotateCcw, Truck } from "lucide-react"

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
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { DialogActions } from "@/components/common/FormDialog"
import { useCan } from "@/hooks/use-can"
import { getApiErrorMessage } from "@/lib/api/client"
import { CapturePaymentDialog } from "./CapturePaymentDialog"
import { CreateReturnDialog } from "./CreateReturnDialog"
import { CreateShipmentDialog } from "./CreateShipmentDialog"

const CANCEL_DESCRIPTION = {
  stock: "Stock holds are released. Cancelling never refunds money — refund captured payments separately.",
  preorder: "Cancelling never refunds money — refund the deposit and any other captured payment separately.",
}

/**
 * What a manual status change does on the backend (services/orders.py set_order_status). Every
 * forward move runs the step it stands for, so stock and the books follow; no payment is recorded.
 */
function statusEffect(order: Order, to: OrderStatus): string {
  const noun = orderNoun(order.order_type)
  switch (to) {
    case "awaiting_payment":
      return `Checks the ${noun} out and holds its stock until payment is captured.`
    case "confirmed":
      if (order.status === "shipped")
        return `Moves the ${noun} back to confirmed because some units have not shipped yet, so they can be shipped.`
      return order.status === "pending"
        ? `Checks the ${noun} out (stock is held) and confirms it. No payment is recorded — capture it separately.`
        : "Confirms it without recording a payment — capture the money separately."
    case "shipped":
      return "Creates one shipment for every unit not yet shipped: the stock leaves the warehouse and the sale is posted to the books."
    case "delivered":
      return order.status === "shipped"
        ? "Marks the shipments on their way delivered. Refused unless delivered shipments cover every line."
        : "Refused unless delivered shipments already cover every line."
    case "closed":
      return `Final: a closed ${noun} cannot be changed again. Nothing else changes, so record any payment still due first.`
    default:
      return ""
  }
}

/** Header buttons for what staff can do now (capture, ship, return, change status, cancel), with the dialogs behind them. */
export function OrderActions({ order, refresh }: { order: Order; refresh: () => void }) {
  const dispatch = useAppDispatch()
  const canManage = useCan("orders.manage")
  const canShip = useCan("shipments.update")
  const canReturn = useCan("returns.manage")
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<"capture" | "ship" | "return" | "status" | null>(null)
  const [nextStatus, setNextStatus] = useState<OrderStatus | "">("")

  const kind = order.order_type
  const noun = orderNoun(kind)

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

  // Cancelling keeps its own button, which explains what it releases.
  const statusTargets = order.allowed_statuses.filter((s) => s !== "cancelled")
  const canChangeStatus = canManage && statusTargets.length > 0
  const labelFor = (s: OrderStatus) => ORDER_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s
  const paymentPending = order.payments.some((p) => p.status === "pending")

  const openStatusDialog = () => {
    setNextStatus("")
    setDialog("status")
  }

  const handleStatus = async () => {
    if (!nextStatus) return
    setBusy(true)
    try {
      await dispatch(updateOrderStatus({ id: order.id, status: nextStatus })).unwrap()
      toast.success(`${order.order_number} is now ${labelFor(nextStatus).toLowerCase()}`)
      setDialog(null)
      refresh()
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Failed to change the ${noun} status`))
    } finally {
      setBusy(false)
    }
  }

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
    <>
      {canCapture && (
        <Button disabled={busy} onClick={() => setDialog("capture")}>
          <CreditCard className="size-4" />
          Capture payment
        </Button>
      )}
      {canCreateShipment && (
        <Button disabled={busy} onClick={() => setDialog("ship")}>
          <Truck className="size-4" />
          Create shipment
        </Button>
      )}
      {canCreateReturn && (
        <Button variant="outline" disabled={busy} onClick={() => setDialog("return")}>
          <RotateCcw className="size-4" />
          Create return
        </Button>
      )}
      {canChangeStatus && (
        <Button variant="outline" disabled={busy} onClick={openStatusDialog}>
          <ListChecks className="size-4" />
          Change status
        </Button>
      )}
      {canCancel && (
        <ConfirmDialog
          destructive
          title={`Cancel ${noun} ${order.order_number}?`}
          description={CANCEL_DESCRIPTION[kind]}
          confirmLabel={`Cancel ${noun}`}
          cancelLabel={`Keep ${noun}`}
          onConfirm={handleCancel}
          trigger={
            <Button variant="outline" className="text-destructive" disabled={busy}>
              <Ban className="size-4" />
              Cancel
            </Button>
          }
        />
      )}

      <Dialog open={dialog === "status"} onOpenChange={(o) => setDialog(o ? "status" : null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change status of {order.order_number}</DialogTitle>
            <DialogDescription>
              Currently {labelFor(order.status).toLowerCase()}. Only the moves allowed from here are listed.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`order-status-${order.id}`}>New status</FieldLabel>
            <FieldContent>
              <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as OrderStatus)}>
                <SelectTrigger id={`order-status-${order.id}`}>
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  {statusTargets.map((s) => (
                    <SelectItem key={s} value={s}>
                      {labelFor(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {nextStatus && <FieldDescription>{statusEffect(order, nextStatus)}</FieldDescription>}
              {nextStatus === "closed" && paymentPending && (
                <FieldDescription className="text-destructive">
                  A payment on this {noun} is still pending (e.g. cash on delivery not collected yet).
                </FieldDescription>
              )}
            </FieldContent>
          </Field>
          <DialogActions
            onCancel={() => setDialog(null)}
            onSubmit={handleStatus}
            submitLabel="Change status"
            submitting={busy}
            submitDisabled={!nextStatus}
          />
        </DialogContent>
      </Dialog>

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
    </>
  )
}
