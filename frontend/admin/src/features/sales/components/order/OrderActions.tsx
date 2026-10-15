import { useState } from "react"
import { toast } from "sonner"
import { Ban, CreditCard, RotateCcw, Truck } from "lucide-react"

import { useAppDispatch } from "@/app/hooks"
import { cancelOrder } from "@/features/sales/slices/orderSlice"
import { orderNoun } from "@/features/sales/shared/kindPaths"
import { NON_RETURNABLE_STATUSES, PRE_SHIPMENT_STATUSES, type Order } from "@/features/sales/types"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { useCan } from "@/hooks/use-can"
import { getApiErrorMessage } from "@/lib/api/client"
import { CapturePaymentDialog } from "./CapturePaymentDialog"
import { CreateReturnDialog } from "./CreateReturnDialog"
import { CreateShipmentDialog } from "./CreateShipmentDialog"

const CANCEL_DESCRIPTION = {
  stock: "Stock holds are released. Cancelling never refunds money — refund captured payments separately.",
  preorder: "Cancelling never refunds money — refund the deposit and any other captured payment separately.",
}

/** Header buttons for what staff can do now (capture, ship, return, cancel), with the dialogs behind them. */
export function OrderActions({ order, refresh }: { order: Order; refresh: () => void }) {
  const dispatch = useAppDispatch()
  const canManage = useCan("orders.manage")
  const canShip = useCan("shipments.update")
  const canReturn = useCan("returns.manage")
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<"capture" | "ship" | "return" | null>(null)

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
