import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { VariantPicker, type PickedVariant } from "@/features/catalog/components/VariantPicker"

import { postAdjustment, postIntake, postWriteOff } from "../api"
import type { Warehouse } from "../types"

export type MovementMode = "intake" | "adjust" | "write_off"

const DEFAULT_WAREHOUSE = "default"

const COPY: Record<MovementMode, { title: string; description: string; submit: string }> = {
  intake: {
    title: "Receive stock",
    description: "Posts a purchase receipt (purchase_in) and updates the average cost.",
    submit: "Receive",
  },
  adjust: {
    title: "Adjust stock",
    description: "Corrects on-hand quantity — use a negative number to reduce stock.",
    submit: "Post adjustment",
  },
  write_off: {
    title: "Write off stock",
    description: "Removes damaged, lost or expired units from on-hand stock.",
    submit: "Write off",
  },
}

const schema = z.object({
  variant: z.custom<PickedVariant | null>().refine((v) => Boolean(v), "Choose a variant"),
  warehouse_id: z.string(),
  quantity: z.number({ error: "Enter a whole number" }).int("Enter a whole number"),
  unit_cost: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+(\.\d{1,4})?$/.test(v), "Up to 4 decimals"),
  notes: z.string(),
})
type FormValues = z.infer<typeof schema>

interface Props {
  mode: MovementMode | null
  onOpenChange: (open: boolean) => void
  warehouses: Warehouse[]
  /** Pre-selected variant / warehouse (e.g. launched from a stock row). */
  variant?: PickedVariant | null
  warehouseId?: string | null
  onDone: () => void
}

export function StockMovementDialog({ mode, onOpenChange, warehouses, variant, warehouseId, onDone }: Props) {
  const open = mode !== null
  const copy = COPY[mode ?? "intake"]
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { variant: null, warehouse_id: DEFAULT_WAREHOUSE, quantity: 1, unit_cost: "", notes: "" },
  })

  useEffect(() => {
    if (open) {
      reset({
        variant: variant ?? null,
        warehouse_id: warehouseId ?? DEFAULT_WAREHOUSE,
        quantity: mode === "adjust" ? 0 : 1,
        unit_cost: "",
        notes: "",
      })
    }
  }, [open, mode, variant, warehouseId, reset])

  const onSubmit = async (values: FormValues) => {
    if (mode === "adjust" ? values.quantity === 0 : values.quantity < 1) {
      setError("quantity", { message: mode === "adjust" ? "Must not be zero" : "Must be at least 1" })
      return
    }
    const base = {
      variant_id: (values.variant as PickedVariant).id,
      warehouse_id: values.warehouse_id === DEFAULT_WAREHOUSE ? null : values.warehouse_id,
    }
    try {
      if (mode === "intake") {
        await postIntake({ ...base, quantity: values.quantity, unit_cost: values.unit_cost || null, notes: values.notes })
        toast.success(`Received ${values.quantity} × ${(values.variant as PickedVariant).sku}`)
      } else if (mode === "adjust") {
        await postAdjustment({
          ...base,
          quantity_delta: values.quantity,
          unit_cost: values.unit_cost || null,
          notes: values.notes,
        })
        toast.success(`Adjusted ${(values.variant as PickedVariant).sku} by ${values.quantity > 0 ? "+" : ""}${values.quantity}`)
      } else {
        await postWriteOff({ ...base, quantity: values.quantity, reason: values.notes })
        toast.success(`Wrote off ${values.quantity} × ${(values.variant as PickedVariant).sku}`)
      }
      onDone()
      onOpenChange(false)
    } catch (err) {
      const fields = getApiFieldErrors(err)
      if (fields.quantity_delta) setError("quantity", { message: fields.quantity_delta })
      if (fields.quantity) setError("quantity", { message: fields.quantity })
      if (fields.unit_cost) setError("unit_cost", { message: fields.unit_cost })
      toast.error(getApiErrorMessage(err, "Stock movement failed"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form id="stock-movement-form" onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="movement-variant">Variant</FieldLabel>
            <FieldContent>
              <Controller
                control={control}
                name="variant"
                render={({ field }) => (
                  <VariantPicker id="movement-variant" value={field.value ?? null} onChange={field.onChange} />
                )}
              />
              <FieldError errors={[errors.variant]} />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="movement-warehouse">Warehouse</FieldLabel>
            <FieldContent>
              <Controller
                control={control}
                name="warehouse_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="movement-warehouse" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT_WAREHOUSE}>Default warehouse</SelectItem>
                      {warehouses
                        .filter((w) => w.is_active && !w.deleted_at)
                        .map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name} ({w.code})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FieldContent>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="movement-qty">{mode === "adjust" ? "Quantity change" : "Quantity"}</FieldLabel>
              <FieldContent>
                <Input
                  id="movement-qty"
                  type="number"
                  step={1}
                  min={mode === "adjust" ? undefined : 1}
                  {...register("quantity", { valueAsNumber: true })}
                />
                {mode === "adjust" && <FieldDescription>e.g. 5 or -3</FieldDescription>}
                <FieldError errors={[errors.quantity]} />
              </FieldContent>
            </Field>
            {mode !== "write_off" && (
              <Field>
                <FieldLabel htmlFor="movement-cost">Unit cost</FieldLabel>
                <FieldContent>
                  <Input id="movement-cost" inputMode="decimal" placeholder="Optional" {...register("unit_cost")} />
                  <FieldError errors={[errors.unit_cost]} />
                </FieldContent>
              </Field>
            )}
          </div>
          <Field>
            <FieldLabel htmlFor="movement-notes">{mode === "write_off" ? "Reason" : "Notes"}</FieldLabel>
            <FieldContent>
              <Textarea
                id="movement-notes"
                rows={2}
                placeholder={mode === "write_off" ? "e.g. water damage" : "Optional"}
                {...register("notes")}
              />
            </FieldContent>
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="stock-movement-form"
            disabled={isSubmitting}
            variant={mode === "write_off" ? "destructive" : "default"}
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
