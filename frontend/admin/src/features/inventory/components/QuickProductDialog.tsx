import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { FormDialog } from "@/components/common/FormDialog"
import { reportFormError } from "@/lib/forms"
import { useCategoryOptions } from "@/features/catalog/lib/useCategoryOptions"

import { createQuickProduct } from "../api"
import type { StockLookupResult } from "../types"

const money = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "Enter a valid amount")

const schema = z.object({
  category_id: z.string().min(1, "Choose a category"),
  name: z.string().trim().min(1, "Name is required"),
  sku: z.string().trim().min(1, "SKU is required"),
  barcode: z.string().trim(),
  price: money.refine((v) => v !== "", "Price is required"),
  cost_price: money,
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
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="qp-name">Product name</FieldLabel>
          <FieldContent>
            <Input id="qp-name" {...register("name")} />
            <FieldError errors={[errors.name]} />
          </FieldContent>
        </Field>
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
        <Field>
          <FieldLabel htmlFor="qp-sku">SKU</FieldLabel>
          <FieldContent>
            <Input id="qp-sku" {...register("sku")} />
            <FieldError errors={[errors.sku]} />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="qp-barcode">Barcode</FieldLabel>
          <FieldContent>
            <Input id="qp-barcode" {...register("barcode")} />
            <FieldError errors={[errors.barcode]} />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="qp-price">Price (BDT)</FieldLabel>
          <FieldContent>
            <Input id="qp-price" inputMode="decimal" {...register("price")} />
            <FieldError errors={[errors.price]} />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="qp-cost">Cost price</FieldLabel>
          <FieldContent>
            <Input id="qp-cost" inputMode="decimal" placeholder="0.00" {...register("cost_price")} />
            <FieldError errors={[errors.cost_price]} />
          </FieldContent>
        </Field>
      </div>
    </FormDialog>
  )
}
