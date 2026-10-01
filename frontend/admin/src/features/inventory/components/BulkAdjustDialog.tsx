import { useEffect } from "react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, PlusIcon, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FieldError } from "@/components/ui/field"
import { getApiErrorMessage } from "@/lib/api/client"
import { VariantPicker, type PickedVariant } from "@/features/catalog/components/VariantPicker"

import { postBulkAdjustments } from "../api"
import type { Warehouse } from "../types"

const DEFAULT_WAREHOUSE = "default"

const schema = z.object({
  notes: z.string(),
  lines: z
    .array(
      z.object({
        variant: z.custom<PickedVariant | null>().refine((v) => Boolean(v), "Choose a variant"),
        warehouse_id: z.string(),
        quantity_delta: z
          .number({ error: "Whole number" })
          .int("Whole number")
          .refine((n) => n !== 0, "Not zero"),
      })
    )
    .min(1),
})
type FormValues = z.infer<typeof schema>

const emptyLine = () => ({ variant: null, warehouse_id: DEFAULT_WAREHOUSE, quantity_delta: 0 })

/** Cycle-count style batch: POST /admin/inventory/adjustments/bulk/ (all-or-nothing). */
export function BulkAdjustDialog({
  open,
  onOpenChange,
  warehouses,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouses: Warehouse[]
  onDone: () => void
}) {
  const {
    control,
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { notes: "", lines: [emptyLine()] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: "lines" })

  useEffect(() => {
    if (open) reset({ notes: "", lines: [emptyLine()] })
  }, [open, reset])

  const onSubmit = async (values: FormValues) => {
    try {
      const res = await postBulkAdjustments(
        values.lines.map((l) => ({
          variant_id: (l.variant as PickedVariant).id,
          warehouse_id: l.warehouse_id === DEFAULT_WAREHOUSE ? null : l.warehouse_id,
          quantity_delta: l.quantity_delta,
          notes: values.notes,
        }))
      )
      toast.success(`${res.count} adjustment${res.count === 1 ? "" : "s"} posted`)
      onDone()
      onOpenChange(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Bulk adjustment failed — nothing was applied"))
    }
  }

  const activeWarehouses = warehouses.filter((w) => w.is_active && !w.deleted_at)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk adjustment</DialogTitle>
          <DialogDescription>
            Post several corrections at once (e.g. after a stock count). If any line fails, none are applied.
          </DialogDescription>
        </DialogHeader>
        <form id="bulk-adjust-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="hidden grid-cols-[1fr_180px_100px_32px] gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Variant</span>
            <span>Warehouse</span>
            <span>Change</span>
            <span />
          </div>
          {fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[1fr_180px_100px_32px]">
              <div>
                <Controller
                  control={control}
                  name={`lines.${i}.variant`}
                  render={({ field }) => <VariantPicker value={field.value ?? null} onChange={field.onChange} />}
                />
                <FieldError errors={[errors.lines?.[i]?.variant]} />
              </div>
              <Controller
                control={control}
                name={`lines.${i}.warehouse_id`}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full" aria-label="Warehouse">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT_WAREHOUSE}>Default</SelectItem>
                      {activeWarehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <div>
                <Input
                  type="number"
                  step={1}
                  aria-label="Quantity change"
                  {...register(`lines.${i}.quantity_delta`, { valueAsNumber: true })}
                />
                <FieldError errors={[errors.lines?.[i]?.quantity_delta]} />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove line"
                disabled={fields.length === 1}
                onClick={() => remove(i)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => append(emptyLine())}>
            <PlusIcon /> Add line
          </Button>
          <Input placeholder="Note for every line (optional), e.g. Cycle count 2026-10" {...register("notes")} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="bulk-adjust-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Post {fields.length} adjustment{fields.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
