import { useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { FormDialog } from "@/components/common/FormDialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TextField } from "@/components/common/form-fields"
import { useAppDispatch } from "@/app/hooks"
import { createShipment } from "@/features/sales/slices/orderSlice"
import { fetchCarrierOptions } from "@/features/shipping/slices/carrierSlice"
import { dispatchShipment } from "@/features/shipping/slices/shipmentSlice"
import type { Carrier } from "@/features/shipping/types"
import type { Order, OrderLine } from "@/features/sales/types"
import { lineQuantitiesValid, toLinePayload } from "@/features/sales/shared/lineQuantities"
import { getApiErrorMessage } from "@/lib/api/client"
import { LineQuantityTable } from "./LineQuantityTable"

const AUTO = "__auto__"
const shippable = (line: OrderLine) => line.shippable_quantity

// Cash still to collect is whatever has not been received yet.
const initialCod = (order: Order) => order.balance_due
const initialQuantities = (order: Order) =>
  Object.fromEntries(order.lines.map((l) => [l.id, String(l.shippable_quantity)]))

interface CreateShipmentDialogProps {
  order: Order
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function CreateShipmentDialog({ order, open, onOpenChange, onCreated }: CreateShipmentDialogProps) {
  const dispatch = useAppDispatch()
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [carrierId, setCarrierId] = useState(AUTO)
  const [trackingNumber, setTrackingNumber] = useState("")
  const [bookNow, setBookNow] = useState(false)
  const [shippingCharge, setShippingCharge] = useState(order.shipping_total)
  const [codAmount, setCodAmount] = useState(() => initialCod(order))
  const [quantities, setQuantities] = useState<Record<string, string>>(() => initialQuantities(order))
  const [submitting, setSubmitting] = useState(false)

  // Start from a clean form each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setCarrierId(AUTO)
      setTrackingNumber("")
      setBookNow(false)
      setShippingCharge(order.shipping_total)
      setCodAmount(initialCod(order))
      setQuantities(initialQuantities(order))
    }
  }

  useEffect(() => {
    if (!open) return
    const request = dispatch(fetchCarrierOptions())
    request
      .unwrap()
      .then((list) => setCarriers(list.filter((c) => c.is_active)))
      .catch(() => setCarriers([]))
    return () => request.abort()
  }, [dispatch, open])

  const valid = lineQuantitiesValid(order.lines, quantities, shippable)
  // A tracking number typed in means the parcel was booked by hand; booking again would double-book.
  const canBookNow = !trackingNumber.trim()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setSubmitting(true)
    try {
      const shipment = await dispatch(
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
      // Booked after the shipment exists, so a courier failure never undoes the shipment itself.
      if (bookNow && canBookNow) {
        try {
          const booked = await dispatch(dispatchShipment(shipment.id)).unwrap()
          toast.success(
            booked.tracking_number
              ? `Shipment created and booked — tracking ${booked.tracking_number}`
              : "Shipment created and booked with the courier"
          )
        } catch (err) {
          toast.warning(
            `Shipment created, but the courier booking failed: ${getApiErrorMessage(err, "unknown error")}. ` +
              'Use "Book courier" on the shipment to try again.'
          )
        }
      } else {
        toast.success("Shipment created")
      }
      onOpenChange(false)
      onCreated()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to create shipment"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create shipment"
      description="Ship some or all remaining units. The order becomes shipped once every line is fully dispatched."
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Create shipment"
      submitDisabled={!valid}
      size="lg"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="shipment-carrier">Carrier</FieldLabel>
          <FieldContent>
            <Select value={carrierId} onValueChange={setCarrierId}>
              <SelectTrigger id="shipment-carrier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO}>Auto-select when booking</SelectItem>
                {carriers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldContent>
        </Field>
        <TextField
          label="Tracking number"
          id="shipment-tracking"
          placeholder="Filled in by the courier when booked"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
        />
        <TextField
          label="Shipping charge"
          id="shipment-charge"
          type="number"
          step="0.01"
          min="0"
          value={shippingCharge}
          onChange={(e) => setShippingCharge(e.target.value)}
        />
        <TextField
          label="COD amount"
          id="shipment-cod"
          type="number"
          step="0.01"
          min="0"
          value={codAmount}
          onChange={(e) => setCodAmount(e.target.value)}
          description="Cash the courier collects on delivery (0 if prepaid)."
        />
      </div>

      <div className="flex items-start gap-2">
        <Checkbox
          id="shipment-book-now"
          checked={bookNow && canBookNow}
          disabled={!canBookNow}
          onCheckedChange={(v) => setBookNow(v === true)}
        />
        <div className="space-y-0.5">
          <Label htmlFor="shipment-book-now">Book with the courier now</Label>
          <p className="text-xs text-muted-foreground">
            {canBookNow
              ? `Sends the parcel to the courier's system right away and stores its consignment number. Otherwise use "Book courier" on the shipment later.`
              : "Not available when you enter a tracking number yourself."}
          </p>
        </div>
      </div>

      <LineQuantityTable
        lines={order.lines}
        maxFor={shippable}
        maxLabel="Unshipped"
        values={quantities}
        onChange={setQuantities}
      />
    </FormDialog>
  )
}
