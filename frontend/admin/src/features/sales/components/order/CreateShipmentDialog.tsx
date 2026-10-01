import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { createShipment } from "@/features/sales/slices/orderSlice"
import { fetchCarrierOptions } from "@/features/shipping/slices/carrierSlice"
import type { Carrier } from "@/features/shipping/types"
import type { Order, OrderLine } from "@/features/sales/types"
import { lineQuantitiesValid, toLinePayload } from "@/features/sales/shared/lineQuantities"
import { getApiErrorMessage } from "@/lib/api/client"
import { LineQuantityTable } from "./LineQuantityTable"

const AUTO = "__auto__"
const shippable = (line: OrderLine) => line.shippable_quantity

interface CreateShipmentDialogProps {
  order: Order
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

function CreateShipmentDialogForm({ order, onOpenChange, onCreated }: Omit<CreateShipmentDialogProps, "open">) {
  const dispatch = useAppDispatch()
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [carrierId, setCarrierId] = useState(AUTO)
  const [trackingNumber, setTrackingNumber] = useState("")
  const [shippingCharge, setShippingCharge] = useState(order.shipping_total)
  // Cash still to collect: nothing when a captured payment already covers the order.
  const [codAmount, setCodAmount] = useState(() =>
    order.payments.some((p) => p.status === "captured") ? "0" : order.grand_total
  )
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(order.lines.map((l) => [l.id, String(l.shippable_quantity)]))
  )
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const request = dispatch(fetchCarrierOptions())
    request
      .unwrap()
      .then((list) => setCarriers(list.filter((c) => c.is_active)))
      .catch(() => setCarriers([]))
    return () => request.abort()
  }, [dispatch])

  const valid = lineQuantitiesValid(order.lines, quantities, shippable)

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await dispatch(
        createShipment({
          orderId: order.id,
          payload: {
            carrier_id: carrierId === AUTO ? null : carrierId,
            tracking_number: trackingNumber.trim(),
            shipping_charge: shippingCharge || "0",
            cod_amount: codAmount || "0",
            lines: toLinePayload(quantities),
          },
        })
      ).unwrap()
      toast.success("Shipment created")
      onOpenChange(false)
      onCreated()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to create shipment"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>Create shipment</DialogTitle>
          <DialogDescription>
            Ship some or all remaining units. The order becomes shipped once every line is fully dispatched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="shipment-carrier">Carrier</FieldLabel>
              <FieldContent>
                <Select value={carrierId} onValueChange={setCarrierId}>
                  <SelectTrigger id="shipment-carrier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO}>Auto-select at dispatch</SelectItem>
                    {carriers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="shipment-tracking">Tracking number</FieldLabel>
              <FieldContent>
                <Input
                  id="shipment-tracking"
                  placeholder="Filled in by the courier on dispatch"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="shipment-charge">Shipping charge</FieldLabel>
              <FieldContent>
                <Input
                  id="shipment-charge"
                  type="number"
                  step="0.01"
                  min="0"
                  value={shippingCharge}
                  onChange={(e) => setShippingCharge(e.target.value)}
                />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="shipment-cod">COD amount</FieldLabel>
              <FieldContent>
                <Input
                  id="shipment-cod"
                  type="number"
                  step="0.01"
                  min="0"
                  value={codAmount}
                  onChange={(e) => setCodAmount(e.target.value)}
                />
                <FieldDescription>Cash the courier collects on delivery (0 if prepaid).</FieldDescription>
              </FieldContent>
            </Field>
          </div>

          <LineQuantityTable
            lines={order.lines}
            maxFor={shippable}
            maxLabel="Unshipped"
            values={quantities}
            onChange={setQuantities}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Create shipment
          </Button>
        </DialogFooter>
    </>
  )
}

export function CreateShipmentDialog({ open, onOpenChange, ...props }: CreateShipmentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {open && <CreateShipmentDialogForm onOpenChange={onOpenChange} {...props} />}
      </DialogContent>
    </Dialog>
  )
}
