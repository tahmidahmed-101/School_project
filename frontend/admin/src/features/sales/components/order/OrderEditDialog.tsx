import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import { FormDialog } from "@/components/common/FormDialog"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { TextareaField } from "@/components/common/form-fields"
import { useAppDispatch } from "@/app/hooks"
import { updateOrder, updateOrderLine } from "@/features/sales/slices/orderSlice"
import { PRE_SHIPMENT_STATUSES, type Order, type OrderLine, type OrderUpdatePayload } from "@/features/sales/types"
import { getApiErrorMessage } from "@/lib/api/client"
import { reportFormError } from "@/lib/forms"

const schema = z.object({
  contact_email: z.union([z.literal(""), z.email("Enter a valid email")]),
  contact_phone: z.string(),
  notes: z.string(),
  full_name: z.string(),
  phone: z.string(),
  line1: z.string(),
  delivery_note: z.string(),
  postal_code: z.string(),
  country: z.string(),
})
type FormValues = z.infer<typeof schema>

function valuesFor(order: Order): FormValues {
  const a = order.shipping_address
  return {
    contact_email: order.contact_email ?? "",
    contact_phone: order.contact_phone ?? "",
    notes: order.notes ?? "",
    full_name: a?.full_name ?? "",
    phone: a?.phone ?? "",
    line1: a?.line1 ?? "",
    delivery_note: a?.delivery_note ?? "",
    postal_code: a?.postal_code ?? "",
    country: a?.country ?? "",
  }
}

const isValidQuantity = (value: string) => Number.isInteger(Number(value)) && Number(value) >= 1

interface OrderEditDialogProps {
  order: Order
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Corrects contact overrides, internal notes, the order's own ship-to snapshot and unshipped line quantities. */
export function OrderEditDialog({ order, open, onOpenChange }: OrderEditDialogProps) {
  const dispatch = useAppDispatch()
  const {
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: valuesFor(order) })

  // Typed quantities by line id; a line without an entry shows the order's own quantity.
  const [quantityEdits, setQuantityEdits] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) reset(valuesFor(order))
  }, [open, order, reset])

  const close = (next: boolean) => {
    if (!next) setQuantityEdits({})
    onOpenChange(next)
  }
  const quantityOf = (line: OrderLine) => quantityEdits[line.id] ?? String(line.quantity)

  // services/orders.py: a quantity can change only before anything ships, and never on a
  // line that has shipped in part.
  const linesEditable = PRE_SHIPMENT_STATUSES.includes(order.status)
  const editableLines = linesEditable ? order.lines.filter((line) => line.shipped_quantity === 0) : []
  const changedLines = editableLines.filter((line) => quantityOf(line) !== String(line.quantity))
  const quantitiesValid = changedLines.every((line) => isValidQuantity(quantityOf(line)))

  const onSubmit = async (values: FormValues) => {
    // Send only what changed — the backend rejects an empty update, and untouched
    // ship-to fields should not be rewritten onto the snapshot.
    const payload: OrderUpdatePayload = {}
    for (const key of Object.keys(dirtyFields) as (keyof FormValues)[]) {
      payload[key] = values[key].trim()
    }
    const hasDetails = Object.keys(payload).length > 0
    if (!hasDetails && changedLines.length === 0) {
      close(false)
      return
    }
    if (hasDetails) {
      try {
        await dispatch(updateOrder({ id: order.id, payload })).unwrap()
      } catch (err) {
        reportFormError(err, { setError, fields: Object.keys(schema.shape), fallback: "Failed to update order" })
        return
      }
    }
    // One line at a time: each change re-holds stock and can be refused on its own.
    for (const line of changedLines) {
      try {
        await dispatch(
          updateOrderLine({ orderId: order.id, lineId: line.id, quantity: Number(quantityOf(line)) })
        ).unwrap()
      } catch (err) {
        toast.error(`${line.product_name}: ${getApiErrorMessage(err, "Failed to update quantity")}`)
        return
      }
    }
    toast.success("Order updated")
    close(false)
  }

  const text = (name: keyof FormValues, label: string, placeholder?: string) => (
    <Field>
      <FieldLabel htmlFor={`order-${name}`}>{label}</FieldLabel>
      <FieldContent>
        <Input id={`order-${name}`} placeholder={placeholder} aria-invalid={!!errors[name]} {...register(name)} />
        <FieldError errors={[errors[name]]} />
      </FieldContent>
    </Field>
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title={`Edit order ${order.order_number}`}
      description="Ship-to changes are written onto this order only — the customer's address book is not touched."
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel="Save changes"
      submitDisabled={!quantitiesValid}
      size="lg"
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {text("contact_email", "Contact email", order.customer_email)}
            {text("contact_phone", "Contact phone", order.customer_phone)}
          </div>
          <FieldDescription>Leave blank to fall back to the ship-to / account details.</FieldDescription>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ship to</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {text("full_name", "Recipient name")}
            {text("phone", "Recipient phone")}
          </div>
          {text("line1", "Address")}
          {text("delivery_note", "Delivery note")}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {text("postal_code", "Postal code")}
            {text("country", "Country")}
          </div>
        </div>

        {editableLines.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quantities</p>
            <div className="divide-y rounded-md border">
              {editableLines.map((line) => {
                const value = quantityOf(line)
                return (
                  <div key={line.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{line.product_name || "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">{line.variant_sku}</p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      className="w-24 shrink-0"
                      aria-label={`Quantity for ${line.product_name}`}
                      aria-invalid={!isValidQuantity(value)}
                      value={value}
                      onChange={(e) => setQuantityEdits((prev) => ({ ...prev, [line.id]: e.target.value }))}
                    />
                  </div>
                )
              })}
            </div>
            <FieldDescription>
              {order.order_type === "preorder"
                ? "Units set aside for this pre-order and its total follow the new quantity."
                : "Stock holds and the order total follow the new quantity."}
            </FieldDescription>
          </div>
        )}

        <TextareaField label="Internal notes" id="order-notes" rows={3} {...register("notes")} />
      </div>
    </FormDialog>
  )
}
