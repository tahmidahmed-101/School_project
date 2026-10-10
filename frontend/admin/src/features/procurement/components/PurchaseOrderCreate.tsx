import { useMemo } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { CheckCircle2, Plus, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldError } from "@/components/ui/field"
import { PageHeader } from "@/components/common/PageHeader"
import { SubmitButton, StickyFormBar } from "@/components/common/FormActions"
import { DateField, SelectField, TextareaField } from "@/components/common/form-fields"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency, todayLocalISODate } from "@/lib/format"
import { useAppDispatch } from "@/app/hooks"
import { useKind } from "@/hooks/use-kind"
import { purchasingBase } from "../lib/kind"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useAllPages } from "@/hooks/use-all-pages"

import { createPurchaseOrder } from "../slices/purchaseOrderSlice"
import type { Supplier } from "../types"
import { useCanManagePurchasing } from "../hooks/useProcurement"
import { VariantPicker } from "@/components/common/VariantPicker"
import { sumCostLines } from "@/lib/money"

const lineSchema = z.object({
  variant: z
    .object({
      id: z.string(),
      product_name: z.string(),
      label: z.string(),
      sku: z.string(),
      cost_price: z.string().nullable(),
    })
    .nullable()
    .refine((v) => Boolean(v), "Pick a variant"),
  quantity_ordered: z.string().refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1, "Min 1"),
  unit_cost: z.string().refine((v) => v !== "" && Number(v) >= 0, "Enter a cost"),
})

const schema = z.object({
  supplier_id: z.string().min(1, "Pick a supplier"),
  order_date: z.string().min(1, "Pick a date"),
  notes: z.string(),
  lines: z.array(lineSchema).min(1, "Add at least one line"),
})
type FormValues = z.infer<typeof schema>

const emptyLine: FormValues["lines"][number] = { variant: null, quantity_ordered: "1", unit_cost: "" }

const PurchaseOrderCreate = () => {
  const kind = useKind()
  const base = purchasingBase(kind)
  const title = kind === "preorder" ? "New pre-order purchase order" : "New Purchase Order"
  useDocumentTitle(title)
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCanManagePurchasing()
  const { items: suppliers } = useAllPages<Supplier>("/admin/procurement/suppliers/", { kind })
  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.is_active), [suppliers])

  const {
    control,
    register,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { supplier_id: "", order_date: todayLocalISODate(), notes: "", lines: [emptyLine] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: "lines" })
  const lines = useWatch({ control, name: "lines" })
  const costLine = (l: (typeof lines)[number] | undefined) => ({
    unitCost: l?.unit_cost,
    quantity: Number(l?.quantity_ordered || 0),
  })
  const total = sumCostLines((lines ?? []).map(costLine))

  const onSubmit = async (values: FormValues) => {
    try {
      const po = await dispatch(
        createPurchaseOrder({
          supplier_id: values.supplier_id,
          order_date: values.order_date,
          notes: values.notes.trim(),
          lines: values.lines.map((l) => ({
            variant_id: l.variant!.id,
            quantity_ordered: Number(l.quantity_ordered),
            unit_cost: l.unit_cost,
          })),
        })
      ).unwrap()
      toast.success(`${po.po_number} created as a draft`)
      navigate(`${base}/orders/${po.id}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to create purchase order"))
    }
  }

  if (!canManage) {
    return (
      <div className="section-container py-16 text-center text-muted-foreground">
        You need the purchasing.manage permission to raise purchase orders.
      </div>
    )
  }

  return (
    <div className="section-container space-y-6">
      <PageHeader
        back={{ to: `${base}/orders`, label: "Back to purchase orders" }}
        title={title}
      />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Order details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SelectField
              control={control}
              name="supplier_id"
              label="Supplier *"
              id="po-supplier"
              placeholder="Select supplier"
              options={activeSuppliers.map((s) => ({ label: s.name, value: s.id }))}
            />
            <DateField label="Order date *" id="po-date" error={errors.order_date} {...register("order_date")} />
            <TextareaField className="md:col-span-3" label="Notes" id="po-notes" rows={2} {...register("notes")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lines</CardTitle>
            <CardDescription>Unit cost is pre-filled from the variant's cost price; adjust to the supplier's quote.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="hidden md:grid grid-cols-[1fr_110px_140px_130px_40px] gap-3 text-xs font-semibold text-muted-foreground">
              <span>VARIANT</span>
              <span>QTY</span>
              <span>UNIT COST</span>
              <span className="text-right">LINE TOTAL</span>
              <span />
            </div>
            {fields.map((f, index) => {
              const lineErrors = errors.lines?.[index]
              const line = lines?.[index]
              return (
                <div
                  key={f.id}
                  className="grid grid-cols-1 md:grid-cols-[1fr_110px_140px_130px_40px] gap-3 items-start rounded-lg border border-border p-3 md:border-0 md:p-0"
                >
                  <div>
                    <Controller
                      control={control}
                      name={`lines.${index}.variant`}
                      render={({ field }) => (
                        <VariantPicker
                          filters={{ category_type: kind }}
                          value={field.value}
                          onChange={(v) => {
                            field.onChange(v)
                            if (v?.cost_price && !line?.unit_cost) {
                              setValue(`lines.${index}.unit_cost`, Number(v.cost_price).toFixed(2))
                            }
                          }}
                        />
                      )}
                    />
                    <FieldError errors={[lineErrors?.variant]} />
                  </div>
                  <div>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      aria-label={`Line ${index + 1} quantity`}
                      aria-invalid={!!lineErrors?.quantity_ordered}
                      {...register(`lines.${index}.quantity_ordered`)}
                    />
                    <FieldError errors={[lineErrors?.quantity_ordered]} />
                  </div>
                  <div>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      aria-label={`Line ${index + 1} unit cost`}
                      aria-invalid={!!lineErrors?.unit_cost}
                      {...register(`lines.${index}.unit_cost`)}
                    />
                    <FieldError errors={[lineErrors?.unit_cost]} />
                  </div>
                  <span className="text-sm font-semibold md:text-right md:pt-2 tabular-nums">
                    {formatCurrency(sumCostLines([costLine(line)]))}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={fields.length <= 1}
                    onClick={() => remove(index)}
                    aria-label={`Remove line ${index + 1}`}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              )
            })}
            <div className="flex items-center justify-between border-t border-border pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => append(emptyLine)}>
                <Plus className="size-4" /> Add line
              </Button>
              <p className="text-sm">
                Order total <span className="ml-2 text-lg font-bold tabular-nums">{formatCurrency(total)}</span>
              </p>
            </div>
            {errors.lines?.root?.message && <p className="text-sm text-destructive">{errors.lines.root.message}</p>}
          </CardContent>
        </Card>

        <StickyFormBar>
          <Button type="button" variant="outline" asChild>
            <Link to={`${base}/orders`}><X className="size-4" /> Cancel</Link>
          </Button>
          <SubmitButton loading={isSubmitting} icon={CheckCircle2}>
            Create Draft
          </SubmitButton>
        </StickyFormBar>
      </form>
    </div>
  )
}

export default PurchaseOrderCreate
