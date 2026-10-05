import { useState } from "react"
import { toast } from "sonner"
import { Loader2, PackageCheck, RefreshCw, Replace, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppDispatch } from "@/app/hooks"
import {
  dispatchShipment,
  replaceDamagedUnits,
  updateShipmentStatus,
} from "@/features/shipping/slices/shipmentSlice"
import {
  nextShipmentStatuses,
  RECEIVABLE_BACK_STATUSES,
  SHIPMENT_STATUS_OPTIONS,
  TERMINAL_SHIPMENT_STATUSES,
  type Shipment,
  type ShipmentStatus,
} from "@/features/shipping/types"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { DialogActions } from "@/components/common/FormDialog"
import { useCan } from "@/hooks/use-can"
import { getApiErrorMessage } from "@/lib/api/client"
import { ReceiveBackDialog } from "./ReceiveBackDialog"

interface ShipmentActionsProps {
  shipment: Shipment
  /** Called after a successful change (e.g. to refetch the parent order). */
  onChanged?: () => void
  size?: "sm" | "default"
}

/**
 * Dispatch-to-courier and status update for a shipment in flight (shipments.update), then receive-back
 * and replace-damaged once it is returned or cancelled (returns.manage). Renders nothing when none apply.
 */
export function ShipmentActions({ shipment, onChanged, size = "sm" }: ShipmentActionsProps) {
  const dispatch = useAppDispatch()
  const canUpdate = useCan("shipments.update")
  const [open, setOpen] = useState(false)
  const [nextStatus, setNextStatus] = useState<ShipmentStatus | "">("")
  const [busy, setBusy] = useState(false)
  const canReturn = useCan("returns.manage")
  const [receiveOpen, setReceiveOpen] = useState(false)

  const canChangeStatus = canUpdate && !TERMINAL_SHIPMENT_STATUSES.includes(shipment.status)
  const canReceiveBack =
    canReturn && RECEIVABLE_BACK_STATUSES.includes(shipment.status) && !shipment.received_back_at
  const owed = shipment.unresolved_damaged_quantity ?? 0
  const canReplace = canReturn && Boolean(shipment.received_back_at) && owed > 0

  if (!canChangeStatus && !canReceiveBack && !canReplace) return null

  const options = nextShipmentStatuses(shipment.status)
  const labelFor = (s: ShipmentStatus) => SHIPMENT_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s

  const handleDispatch = async () => {
    setBusy(true)
    try {
      const updated = await dispatch(dispatchShipment(shipment.id)).unwrap()
      toast.success(
        updated.tracking_number ? `Booked with courier — tracking ${updated.tracking_number}` : "Dispatched to courier"
      )
      onChanged?.()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to dispatch shipment"))
    } finally {
      setBusy(false)
    }
  }

  const handleStatus = async () => {
    if (!nextStatus) return
    setBusy(true)
    try {
      await dispatch(updateShipmentStatus({ id: shipment.id, status: nextStatus })).unwrap()
      toast.success(`Shipment marked ${labelFor(nextStatus).toLowerCase()}`)
      setOpen(false)
      setNextStatus("")
      onChanged?.()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update shipment status"))
    } finally {
      setBusy(false)
    }
  }

  const handleReplace = async () => {
    setBusy(true)
    try {
      await dispatch(replaceDamagedUnits(shipment.id)).unwrap()
      toast.success("Replacement stock reserved — create a new shipment from the order to send it")
      onChanged?.()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to replace the damaged units"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-2" data-no-row-click="true" onClick={(e) => e.stopPropagation()}>
      {canReceiveBack && (
        <>
          <Button variant="outline" size={size} disabled={busy} onClick={() => setReceiveOpen(true)}>
            <PackageCheck className="size-3.5" />
            Receive back
          </Button>
          <ReceiveBackDialog
            shipment={shipment}
            open={receiveOpen}
            onOpenChange={setReceiveOpen}
            onDone={onChanged}
          />
        </>
      )}
      {canReplace && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size={size} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Replace className="size-3.5" />}
              Replace damaged
            </Button>
          }
          title={`Replace ${owed} damaged unit${owed === 1 ? "" : "s"}?`}
          description="Reserves replacement stock for this order and reopens it for shipping. It is refused if there is not enough stock. Nothing is refunded; send the replacement as a new shipment from the order."
          confirmLabel="Replace"
          cancelLabel="Go back"
          onConfirm={handleReplace}
        />
      )}
      {canChangeStatus && shipment.status === "pending" && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size={size} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Dispatch
            </Button>
          }
          title="Dispatch to courier?"
          description={
            shipment.carrier_name
              ? `Books this consignment with ${shipment.carrier_name}'s courier integration and stores the returned tracking number.`
              : "No carrier is set, so the cheapest carrier quoting a rate for the delivery zone is picked automatically."
          }
          confirmLabel="Dispatch"
          cancelLabel="Go back"
          onConfirm={handleDispatch}
        />
      )}
      {canChangeStatus && (
        <Button variant="outline" size={size} disabled={busy || options.length === 0} onClick={() => setOpen(true)}>
          <RefreshCw className="size-3.5" />
          Update status
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update shipment status</DialogTitle>
            <DialogDescription>
              Pending → shipped → in transit → out for delivery only move forward. Delivered, returned and cancelled are
              final.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={`shipment-status-${shipment.id}`}>New status</FieldLabel>
            <FieldContent>
              <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as ShipmentStatus)}>
                <SelectTrigger id={`shipment-status-${shipment.id}`}>
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  {options.map((s) => (
                    <SelectItem key={s} value={s}>
                      {labelFor(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {nextStatus === "delivered" && (
                <FieldDescription>The order is marked delivered once every shipment is delivered.</FieldDescription>
              )}
              {(nextStatus === "returned" || nextStatus === "cancelled") && (
                <FieldDescription>
                  Stock does not come back yet. Use "Receive back" once the parcel physically arrives.
                </FieldDescription>
              )}
            </FieldContent>
          </Field>
          <DialogActions
            onCancel={() => setOpen(false)}
            onSubmit={handleStatus}
            submitLabel="Save status"
            submitting={busy}
            submitDisabled={!nextStatus}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
