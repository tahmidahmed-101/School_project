import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { FormDialog } from "@/components/common/FormDialog"
import { MoneyField, TextField } from "@/components/common/form-fields"
import { moneySchema, reportFormError } from "@/lib/forms"
import { useCategoryOptions } from "@/features/catalog/lib/useCategoryOptions"

import { createQuickProduct } from "../api"
import type { StockLookupResult } from "../types"

const schema = z.object({
  category_id: z.string().min(1, "Choose a category"),
  name: z.string().trim().min(1, "Name is required"),
  sku: z.string().trim().min(1, "SKU is required"),
  barcode: z.string().trim(),
  price: moneySchema.refine((v) => v !== "", "Price is required"),
  cost_price: moneySchema,
})
type FormValues = z.infer<typeof schema>

/** Stock App "create": a product + its first variant in one call, ready to be received. */
export function QuickProductDialog({
  open,
  onOpenChange,
  initialCode,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The SKU/barcode the lookup didn't find. */
  initialCode: string
  onCreated: (result: StockLookupResult) => void
}) {
  const { options } = useCategoryOptions()
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { category_id: "", name: "", sku: "", barcode: "", price: "", cost_price: "" },
  })

  useEffect(() => {
    if (open) {
      const looksLikeBarcode = /^\d{8,14}$/.test(initialCode)
      reset({
        category_id: "",
        name: "",
        sku: looksLikeBarcode ? "" : initialCode,
        barcode: looksLikeBarcode ? initialCode : "",
        price: "",
        cost_price: "",
      })
    }
  }, [open, initialCode, reset])

  const onSubmit = async (values: FormValues) => {
    try {
      const res = await createQuickProduct({
        category_id: values.category_id,
        name: values.name,
        sku: values.sku,
        price: values.price,
        ...(values.cost_price ? { cost_price: values.cost_price } : {}),
        barcode: values.barcode,
      })
      toast.success(`${values.name} created`)
      onCreated(res)
      onOpenChange(false)
    } catch (err) {
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to create product" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Quick-create product"
      description="Creates the product and its first variant so it can be stocked right away."
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel="Create"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          className="sm:col-span-2"
          label="Product name"
          id="qp-name"
          error={errors.name}
          {...register("name")}
        />
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="qp-category">Category</FieldLabel>
          <FieldContent>
            <Controller
              control={control}
              name="category_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="qp-category" className="w-full">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {"  ".repeat(o.depth)}
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[errors.category_id]} />
          </FieldContent>
        </Field>
        <TextField label="SKU" id="qp-sku" error={errors.sku} {...register("sku")} />
        <TextField label="Barcode" id="qp-barcode" error={errors.barcode} {...register("barcode")} />
        <MoneyField label="Price (BDT)" id="qp-price" error={errors.price} {...register("price")} />
        <MoneyField
          label="Cost price"
          id="qp-cost"
          placeholder="0.00"
          error={errors.cost_price}
          {...register("cost_price")}
        />
      </div>
    </FormDialog>
  )
}
