import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { DateField, TextField } from "@/components/common/form-fields"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import type { Kind } from "@/hooks/use-kind"
import { fromDatetimeLocal, getDefaultCurrency, toDatetimeLocal } from "@/lib/format"
import { moneySchema, reportFormError } from "@/lib/forms"

import { createVariant, updateVariant } from "../api"
import type { ProductVariant, ProductVariantPayload } from "../types"

const fields = z.object({
  sku: z.string().trim(),
  color: z.string().trim(),
  size: z.string().trim(),
  price: moneySchema,
  cost_price: moneySchema,
  weight: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+(\.\d{1,3})?$/.test(v), "Up to 3 decimals (kg)"),
  is_active: z.boolean(),
  // Stock variants only.
  barcode: z.string().trim(),
  discount_price: moneySchema,
  wholesale_price: moneySchema,
  show_wholesale_price: z.boolean(),
  // Pre-order variants only.
  preorder_price: moneySchema,
  preorder_start_date: z.string(),
  preorder_end_date: z.string(),
  release_date: z.string(),
  preorder_stock_limit: z.string().refine((v) => v === "" || /^\d+$/.test(v), "Whole number"),
})
type FormValues = z.infer<typeof fields>

const stockSchema = fields.refine(
  (v) => !v.discount_price || !v.price || Number(v.discount_price) < Number(v.price),
  { path: ["discount_price"], message: "Must be lower than the price" }
)

const preorderSchema = fields.superRefine((v, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message })
  if (!v.preorder_start_date) issue("preorder_start_date", "Choose when pre-orders open")
  if (!v.preorder_end_date) issue("preorder_end_date", "Choose when pre-orders close")
  if (v.preorder_start_date && v.preorder_end_date && v.preorder_start_date >= v.preorder_end_date) {
    issue("preorder_end_date", "Must be after the start")
  }
  if (v.release_date && v.preorder_end_date && v.release_date < v.preorder_end_date) {
    issue("release_date", "Must not be before pre-orders close")
  }
  if (v.preorder_price && v.price && Number(v.preorder_price) >= Number(v.price)) {
    issue("preorder_price", "Must be lower than the price")
  }
})

/** `settings` supplies the pre-order fields: the variant itself, or a sibling for a new variant. */
const toValues = (v: ProductVariant | null | undefined, settings: ProductVariant | null | undefined): FormValues => ({
  sku: v?.sku ?? "",
  color: v?.color ?? "",
  size: v?.size ?? "",
  price: v?.price ?? "",
  cost_price: v?.cost_price ?? "",
  weight: v?.weight ?? "",
  is_active: v?.is_active ?? true,
  barcode: v?.barcode ?? "",
  discount_price: v?.discount_price ?? "",
  wholesale_price: v?.wholesale_price ?? "",
  show_wholesale_price: v?.show_wholesale_price ?? false,
  preorder_price: settings?.preorder_price ?? "",
  preorder_start_date: toDatetimeLocal(settings?.preorder_start_date),
  preorder_end_date: toDatetimeLocal(settings?.preorder_end_date),
  release_date: toDatetimeLocal(settings?.release_date),
  preorder_stock_limit: settings?.preorder_stock_limit != null ? String(settings.preorder_stock_limit) : "",
})

const stockPayload = (values: FormValues): ProductVariantPayload => ({
  barcode: values.barcode,
  discount_price: values.discount_price || null,
  wholesale_price: values.wholesale_price || null,
  show_wholesale_price: values.show_wholesale_price,
})

const preorderPayload = (values: FormValues): ProductVariantPayload => ({
  is_preorder_enabled: true,
  preorder_price: values.preorder_price || null,
  preorder_start_date: fromDatetimeLocal(values.preorder_start_date),
  preorder_end_date: fromDatetimeLocal(values.preorder_end_date),
  release_date: fromDatetimeLocal(values.release_date),
  preorder_stock_limit: values.preorder_stock_limit === "" ? null : Number(values.preorder_stock_limit),
})

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The kind of the variant's product; it decides which fields the dialog has. */
  kind: Kind
  productId: string
  /** The variant being edited; null/undefined creates a new one. */
  variant?: ProductVariant | null
  /** Pre-order only: a variant of the same product whose dates, price and limit a new variant starts with. */
  sibling?: ProductVariant | null
  onSaved: () => void
}

export function VariantFormDialog({ open, onOpenChange, kind, productId, variant, sibling, onSaved }: Props) {
  const isEditing = Boolean(variant)
  const isStock = kind === "stock"
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(isStock ? stockSchema : preorderSchema),
    defaultValues: toValues(variant, variant ?? sibling),
  })

  useEffect(() => {
    if (open) reset(toValues(variant, variant ?? sibling))
  }, [open, variant, sibling, reset])

  const onSubmit = async (values: FormValues) => {
    const payload: ProductVariantPayload = {
      color: values.color,
      size: values.size,
      weight: values.weight || null,
      ...(isStock ? stockPayload(values) : preorderPayload(values)),
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

  const text = (name: keyof FormValues, label: string, opts: { placeholder?: string; withTime?: boolean } = {}) => {
    const FieldComponent = opts.withTime ? DateField : TextField
    return (
      <FieldComponent
        id={`variant-${name}`}
        label={label}
        placeholder={opts.placeholder}
        withTime={opts.withTime}
        error={errors[name]}
        {...register(name)}
      />
    )
  }

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
        {isStock && text("barcode", "Barcode")}
        {text("color", "Colour")}
        {text("size", "Size")}
        {text("price", `Price (${getDefaultCurrency()})`, { placeholder: "0.00" })}
        {isStock && text("discount_price", "Discount price", { placeholder: "Optional" })}
        {text("cost_price", "Cost price", { placeholder: "0.00" })}
        {text("weight", "Weight (kg)", { placeholder: "Optional" })}
        {isStock && (
          <>
            {text("wholesale_price", "Wholesale price", { placeholder: "Optional" })}
            <div className="self-end">
              <SwitchField control={control} name="show_wholesale_price" label="Show wholesale price" />
            </div>
          </>
        )}
        {!isStock && (
          <>
            {text("preorder_start_date", "Pre-orders open *", { withTime: true })}
            {text("preorder_end_date", "Pre-orders close *", { withTime: true })}
            {text("release_date", "Release date", { withTime: true })}
            {text("preorder_price", "Pre-order price", { placeholder: "Optional" })}
            {text("preorder_stock_limit", "Pre-order limit", { placeholder: "Unlimited" })}
          </>
        )}
        {isEditing && <SwitchField control={control} name="is_active" label="Active" />}
      </div>
    </FormDialog>
  )
}
