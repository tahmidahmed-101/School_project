import { useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Input } from "@/components/ui/input"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/format"
import { reportFormError } from "@/lib/forms"

import { createVariant, updateVariant } from "../api"
import type { ProductVariant, ProductVariantPayload } from "../types"

const money = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0), "Enter a valid amount")

const schema = z
  .object({
    sku: z.string().trim(),
    barcode: z.string().trim(),
    color: z.string().trim(),
    size: z.string().trim(),
    price: money,
    cost_price: money,
    discount_price: money,
    weight: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d+(\.\d{1,3})?$/.test(v), "Up to 3 decimals (kg)"),
    wholesale_price: money,
    show_wholesale_price: z.boolean(),
    is_active: z.boolean(),
    is_preorder_enabled: z.boolean(),
    preorder_price: money,
    preorder_start_date: z.string(),
    preorder_end_date: z.string(),
    release_date: z.string(),
    preorder_stock_limit: z.string().refine((v) => v === "" || /^\d+$/.test(v), "Whole number"),
  })
  .refine((v) => !v.discount_price || !v.price || Number(v.discount_price) < Number(v.price), {
    path: ["discount_price"],
    message: "Must be lower than the price",
  })

type FormValues = z.infer<typeof schema>

const toValues = (v?: ProductVariant | null): FormValues => ({
  sku: v?.sku ?? "",
  barcode: v?.barcode ?? "",
  color: v?.color ?? "",
  size: v?.size ?? "",
  price: v?.price ?? "",
  cost_price: v?.cost_price ?? "",
  discount_price: v?.discount_price ?? "",
  weight: v?.weight ?? "",
  wholesale_price: v?.wholesale_price ?? "",
  show_wholesale_price: v?.show_wholesale_price ?? false,
  is_active: v?.is_active ?? true,
  is_preorder_enabled: v?.is_preorder_enabled ?? false,
  preorder_price: v?.preorder_price ?? "",
  preorder_start_date: toDatetimeLocal(v?.preorder_start_date),
  preorder_end_date: toDatetimeLocal(v?.preorder_end_date),
  release_date: toDatetimeLocal(v?.release_date),
  preorder_stock_limit: v?.preorder_stock_limit != null ? String(v.preorder_stock_limit) : "",
})

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  productId: string
  /** The variant being edited; null/undefined creates a new one. */
  variant?: ProductVariant | null
  onSaved: () => void
}

export function VariantFormDialog({ open, onOpenChange, productId, variant, onSaved }: Props) {
  const isEditing = Boolean(variant)
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: toValues(variant) })

  useEffect(() => {
    if (open) reset(toValues(variant))
  }, [open, variant, reset])

  const preorder = useWatch({ control, name: "is_preorder_enabled" })

  const onSubmit = async (values: FormValues) => {
    const payload: ProductVariantPayload = {
      barcode: values.barcode,
      color: values.color,
      size: values.size,
      discount_price: values.discount_price || null,
      weight: values.weight || null,
      wholesale_price: values.wholesale_price || null,
      show_wholesale_price: values.show_wholesale_price,
      is_preorder_enabled: values.is_preorder_enabled,
      preorder_price: values.preorder_price || null,
      preorder_start_date: fromDatetimeLocal(values.preorder_start_date),
      preorder_end_date: fromDatetimeLocal(values.preorder_end_date),
      release_date: fromDatetimeLocal(values.release_date),
      preorder_stock_limit: values.preorder_stock_limit === "" ? null : Number(values.preorder_stock_limit),
    }
    if (values.sku) payload.sku = values.sku
    if (values.price) payload.price = values.price
    if (values.cost_price) payload.cost_price = values.cost_price
    try {
      if (variant) {
        payload.is_active = values.is_active
        await updateVariant(variant.id, payload)
        toast.success(`Variant ${values.sku || variant.sku} updated`)
      } else {
        await createVariant(productId, payload)
        toast.success("Variant created")
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to save variant" })
    }
  }

  const text = (name: keyof FormValues, label: string, opts: { placeholder?: string; type?: string; hint?: string } = {}) => (
    <Field>
      <FieldLabel htmlFor={`variant-${name}`}>{label}</FieldLabel>
      <FieldContent>
        <Input
          id={`variant-${name}`}
          type={opts.type ?? "text"}
          placeholder={opts.placeholder}
          {...register(name)}
        />
        {opts.hint && <FieldDescription>{opts.hint}</FieldDescription>}
        <FieldError errors={[errors[name]]} />
      </FieldContent>
    </Field>
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? `Edit variant ${variant?.sku}` : "Add variant"}
      description={isEditing ? "Changes apply to this SKU only." : "Leave price blank to inherit it from a sibling variant."}
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={isEditing ? "Save variant" : "Create variant"}
      size="lg"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {text("sku", "SKU", { placeholder: isEditing ? undefined : "Auto-generated if blank" })}
        {text("barcode", "Barcode")}
        {text("color", "Colour")}
        {text("size", "Size")}
        {text("price", "Price (BDT)", { placeholder: "0.00" })}
        {text("discount_price", "Discount price", { placeholder: "Optional" })}
        {text("cost_price", "Cost price", { placeholder: "0.00" })}
        {text("weight", "Weight (kg)", { placeholder: "Optional" })}
        {text("wholesale_price", "Wholesale price", { placeholder: "Optional" })}
        <div className="self-end">
          <SwitchField control={control} name="show_wholesale_price" label="Show wholesale price" />
        </div>
        {isEditing && <SwitchField control={control} name="is_active" label="Active" />}
      </div>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <SwitchField
          control={control}
          name="is_preorder_enabled"
          label="Pre-order"
          description="Allow customers to order before stock arrives."
        />
        {preorder && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {text("preorder_price", "Pre-order price", { placeholder: "Optional" })}
            {text("preorder_stock_limit", "Pre-order limit", { placeholder: "Unlimited" })}
            {text("preorder_start_date", "Starts", { type: "datetime-local" })}
            {text("preorder_end_date", "Ends", { type: "datetime-local" })}
            {text("release_date", "Release date", { type: "datetime-local" })}
          </div>
        )}
      </div>
    </FormDialog>
  )
}
