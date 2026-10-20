import { useEffect } from "react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { PlusIcon, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FieldError } from "@/components/ui/field"
import { FormDialog } from "@/components/common/FormDialog"
import type { Kind } from "@/hooks/use-kind"
import { getApiErrorMessage } from "@/lib/api/client"
import { VariantPicker, type PickedVariant } from "@/components/common/VariantPicker"

import { postStockTransfer } from "../api"
import type { StockTransfer, Warehouse } from "../types"

const schema = z
  .object({
    from_warehouse_id: z.string().min(1, "Choose a warehouse"),
    to_warehouse_id: z.string().min(1, "Choose a warehouse"),
    notes: z.string().max(255, "At most 255 characters"),
    lines: z
      .array(
        z.object({
          variant: z.custom<PickedVariant | null>().refine((v) => Boolean(v), "Choose a variant"),
          quantity: z.number({ error: "Whole number" }).int("Whole number").min(1, "At least 1"),
        })
      )
      .min(1),
  })
  .refine((v) => v.from_warehouse_id !== v.to_warehouse_id, {
    path: ["to_warehouse_id"],
    message: "Pick a different warehouse",
  })
  .refine((v) => new Set(v.lines.map((l) => l.variant?.id)).size === v.lines.length, {
    path: ["lines"],
    message: "Each variant can appear once",
  })
type FormValues = z.infer<typeof schema>

const emptyLine = () => ({ variant: null, quantity: 1 })

/**
 * Moves available stock between two warehouses of the same kind:
 * POST /admin/inventory/transfers/ (all-or-nothing). Reserved units stay where they are.
 */
export function StockTransferDialog({
  open,
  onOpenChange,
  kind,
  warehouses,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: Kind
  warehouses: Warehouse[]
  onDone: (transfer: StockTransfer) => void
}) {
  const activeWarehouses = warehouses.filter((w) => w.is_active && !w.deleted_at)
  const defaultFrom = activeWarehouses.find((w) => w.is_default)?.id ?? activeWarehouses[0]?.id ?? ""

  const {
    control,
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { from_warehouse_id: defaultFrom, to_warehouse_id: "", notes: "", lines: [emptyLine()] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: "lines" })

  useEffect(() => {
    if (open) reset({ from_warehouse_id: defaultFrom, to_warehouse_id: "", notes: "", lines: [emptyLine()] })
  }, [open, reset, defaultFrom])

  const onSubmit = async (values: FormValues) => {
    try {
      const transfer = await postStockTransfer({
        from_warehouse_id: values.from_warehouse_id,
        to_warehouse_id: values.to_warehouse_id,
        notes: values.notes.trim(),
        lines: values.lines.map((l) => ({ variant_id: (l.variant as PickedVariant).id, quantity: l.quantity })),
      })
      const units = transfer.lines.reduce((sum, l) => sum + l.quantity, 0)
      toast.success(
        `${transfer.transfer_number}: moved ${units} unit${units === 1 ? "" : "s"} to ${transfer.to_warehouse_name}`
      )
      onDone(transfer)
      onOpenChange(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Transfer failed — nothing was moved"))
    }
  }

  const warehouseSelect = (name: "from_warehouse_id" | "to_warehouse_id", label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id={name} className="w-full">
              <SelectValue placeholder="Choose a warehouse" />
            </SelectTrigger>
            <SelectContent>
              {activeWarehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                  {w.is_default ? " (default)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <FieldError errors={[errors[name]]} />
    </div>
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Transfer stock"
      description="Move available units from one warehouse to another. If any line is short of available stock, nothing is moved."
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel="Transfer"
      className="sm:max-w-3xl"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {warehouseSelect("from_warehouse_id", "From")}
        {warehouseSelect("to_warehouse_id", "To")}
      </div>

      <div className="hidden grid-cols-[1fr_110px_32px] gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
        <span>Variant</span>
        <span>Quantity</span>
        <span />
      </div>
      {fields.map((f, i) => (
        <div key={f.id} className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[1fr_110px_32px]">
          <div>
            <Controller
              control={control}
              name={`lines.${i}.variant`}
              render={({ field }) => (
                <VariantPicker
                  value={field.value ?? null}
                  onChange={field.onChange}
                  filters={{ category_type: kind }}
                />
              )}
            />
            <FieldError errors={[errors.lines?.[i]?.variant]} />
          </div>
          <div>
            <Input
              type="number"
              min={1}
              step={1}
              aria-label="Quantity"
              {...register(`lines.${i}.quantity`, { valueAsNumber: true })}
            />
            <FieldError errors={[errors.lines?.[i]?.quantity]} />
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
      <FieldError errors={[errors.lines?.root ?? (errors.lines as { message?: string } | undefined)]} />
      <Button type="button" variant="outline" size="sm" onClick={() => append(emptyLine())}>
        <PlusIcon /> Add line
      </Button>
      <Input placeholder="Note (optional), e.g. Restock the Dhanmondi shop" {...register("notes")} />
      <FieldError errors={[errors.notes]} />
    </FormDialog>
  )
}
