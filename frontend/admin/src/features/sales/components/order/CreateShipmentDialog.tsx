import { useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { FormDialog } from "@/components/common/FormDialog"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TextField } from "@/components/common/form-fields"
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create shipment"
      description={
        order.order_type === "preorder"
          ? "Ship the units already set aside for this pre-order. After goods come in, use Allocate arrived stock on the pre-order Orders page."
          : "Ship some or all remaining units. The order becomes shipped once every line is fully dispatched."
      }
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
        <TextField
          label="Tracking number"
          id="shipment-tracking"
          placeholder="Filled in by the courier on dispatch"
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
