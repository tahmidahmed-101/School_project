import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { useAppDispatch } from "@/app/hooks"
import { updateOrder } from "@/features/sales/slices/orderSlice"
import type { Order, OrderUpdatePayload } from "@/features/sales/types"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"

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

interface OrderEditDialogProps {
  order: Order
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Corrects contact overrides, internal notes and the order's own ship-to snapshot (PATCH). */
export function OrderEditDialog({ order, open, onOpenChange }: OrderEditDialogProps) {
  const dispatch = useAppDispatch()
  const {
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: valuesFor(order) })

  useEffect(() => {
    if (open) reset(valuesFor(order))
  }, [open, order, reset])

  const onSubmit = async (values: FormValues) => {
    // Send only what changed — the backend rejects an empty update, and untouched
    // ship-to fields should not be rewritten onto the snapshot.
    const payload: OrderUpdatePayload = {}
    for (const key of Object.keys(dirtyFields) as (keyof FormValues)[]) {
      payload[key] = values[key].trim()
    }
    if (Object.keys(payload).length === 0) {
      onOpenChange(false)
      return
    }
    try {
      await dispatch(updateOrder({ id: order.id, payload })).unwrap()
      toast.success("Order details updated")
      onOpenChange(false)
    } catch (err) {
      for (const [field, message] of Object.entries(getApiFieldErrors(err))) {
        if (field in schema.shape) setError(field as keyof FormValues, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to update order"))
    }
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit order {order.order_number}</DialogTitle>
          <DialogDescription>
            Ship-to changes are written onto this order only — the customer's address book is not touched.
          </DialogDescription>
        </DialogHeader>

        <form id="order-edit-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
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

          <Field>
            <FieldLabel htmlFor="order-notes">Internal notes</FieldLabel>
            <FieldContent>
              <Textarea id="order-notes" rows={3} {...register("notes")} />
            </FieldContent>
          </Field>
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="order-edit-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
