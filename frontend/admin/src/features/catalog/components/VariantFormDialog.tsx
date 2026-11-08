import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { TextField } from "@/components/common/form-fields"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { getDefaultCurrency } from "@/lib/format"
import { moneySchema, reportFormError } from "@/lib/forms"

import { createVariant, updateVariant } from "../api"
import type { ProductVariant, ProductVariantPayload } from "../types"
import { reportedRefusal } from "../lib/productFormBase"

const fields = z.object({
  sku: z.string().trim(),
  price: moneySchema,
  cost_price: moneySchema,
  weight: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+(\.\d{1,3})?$/.test(v), "Up to 3 decimals (kg)"),
  is_active: z.boolean(),
  barcode: z.string().trim(),
  discount_price: moneySchema,
  wholesale_price: moneySchema,
  show_wholesale_price: z.boolean(),
})
type FormValues = z.infer<typeof fields>

const schema = fields.refine(
  (v) => !v.discount_price || !v.price || Number(v.discount_price) < Number(v.price),
  { path: ["discount_price"], message: "Must be lower than the price" }
)

const toValues = (v: ProductVariant | null | undefined): FormValues => ({
  sku: v?.sku ?? "",
  price: v?.price ?? "",
  cost_price: v?.cost_price ?? "",
  weight: v?.weight ?? "",
  is_active: v?.is_active ?? true,
  barcode: v?.barcode ?? "",
  discount_price: v?.discount_price ?? "",
  wholesale_price: v?.wholesale_price ?? "",
  show_wholesale_price: v?.show_wholesale_price ?? false,
})

const stockPayload = (values: FormValues): ProductVariantPayload => ({
  barcode: values.barcode,
  discount_price: values.discount_price || null,
  wholesale_price: values.wholesale_price || null,
  show_wholesale_price: values.show_wholesale_price,
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
  const chosen = variant?.option_values ?? []
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toValues(variant),
  })

  useEffect(() => {
    if (open) reset(toValues(variant))
  }, [open, variant, reset])

  const onSubmit = async (values: FormValues) => {
    const payload: ProductVariantPayload = {
      weight: values.weight || null,
      ...stockPayload(values),
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
      if (reportedRefusal(err)) return
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to save variant" })
    }
  }

  const text = (name: keyof FormValues, label: string, opts: { placeholder?: string } = {}) => (
    <TextField id={`variant-${name}`} label={label} placeholder={opts.placeholder} error={errors[name]} {...register(name)} />
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? `Edit ${variant?.title || variant?.sku}` : "Add variant"}
      description={isEditing ? "Changes apply to this variant only." : "The price, SKU and stock unit of this product."}
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={isEditing ? "Save variant" : "Create variant"}
      size="lg"
    >
      {chosen.length > 0 && (
        <div className="space-y-1">
          <dl className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            {chosen.map((picked) => (
              <div key={picked.option_id} className="flex min-w-0 gap-1.5">
                <dt className="text-muted-foreground">{picked.option_name}</dt>
                <dd className="break-words font-medium">{picked.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">Options are set on the product and cannot be changed here.</p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {text("sku", "SKU", { placeholder: isEditing ? undefined : "Auto-generated if blank" })}
        {text("barcode", "Barcode")}
        {text("price", `Price (${getDefaultCurrency()})`, { placeholder: "0.00" })}
        {text("discount_price", "Discount price", { placeholder: "Optional" })}
        {text("cost_price", "Cost price", { placeholder: "0.00" })}
        {text("weight", "Weight (kg)", { placeholder: "Optional" })}
        {text("wholesale_price", "Wholesale price", { placeholder: "Optional" })}
        <div className="self-end">
          <SwitchField control={control} name="show_wholesale_price" label="Show wholesale price" />
        </div>
        {isEditing && <SwitchField control={control} name="is_active" label="Status" onLabel="Active" offLabel="Inactive" />}
      </div>
    </FormDialog>
  )
}
