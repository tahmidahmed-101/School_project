import { useState } from "react"
import { toast } from "sonner"
import { Loader2, RefreshCw, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppDispatch } from "@/app/hooks"
import { dispatchShipment, updateShipmentStatus } from "@/features/shipping/slices/shipmentSlice"
import {
  nextShipmentStatuses,
  SHIPMENT_STATUS_OPTIONS,
  TERMINAL_SHIPMENT_STATUSES,
  type Shipment,
  type ShipmentStatus,
} from "@/features/shipping/types"
import { ConfirmAction } from "@/features/sales/shared/ConfirmAction"
import { useCan } from "@/features/sales/shared/useCan"
import { getApiErrorMessage } from "@/lib/api/client"

interface ShipmentActionsProps {
  shipment: Shipment
  /** Called after a successful change (e.g. to refetch the parent order). */
  onChanged?: () => void
  size?: "sm" | "default"
}

/** Dispatch-to-courier + status update for one shipment. Renders nothing without shipments.update. */
export function ShipmentActions({ shipment, onChanged, size = "sm" }: ShipmentActionsProps) {
  const dispatch = useAppDispatch()
  const canUpdate = useCan("shipments.update")
  const [open, setOpen] = useState(false)
  const [nextStatus, setNextStatus] = useState<ShipmentStatus | "">("")
  const [busy, setBusy] = useState(false)

  if (!canUpdate || TERMINAL_SHIPMENT_STATUSES.includes(shipment.status)) return null

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

  return (
    <div className="flex flex-wrap gap-2" data-no-row-click="true" onClick={(e) => e.stopPropagation()}>
      {shipment.status === "pending" && (
        <ConfirmAction
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
          onConfirm={handleDispatch}
        />
      )}
      <Button variant="outline" size={size} disabled={busy || options.length === 0} onClick={() => setOpen(true)}>
        <RefreshCw className="size-3.5" />
        Update status
      </Button>

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
            </FieldContent>
          </Field>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStatus} disabled={!nextStatus || busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Save status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
