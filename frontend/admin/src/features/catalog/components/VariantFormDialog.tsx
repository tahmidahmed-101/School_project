import { useEffect } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/format"

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
      for (const [field, message] of Object.entries(getApiFieldErrors(err))) {
        if (field in values) setError(field as keyof FormValues, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to save variant"))
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit variant ${variant?.sku}` : "Add variant"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Changes apply to this SKU only." : "Leave price blank to inherit it from a sibling variant."}
          </DialogDescription>
        </DialogHeader>

        <form id="variant-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
            <Field orientation="horizontal" className="self-end">
              <FieldContent>
                <FieldLabel htmlFor="variant-show_wholesale_price">Show wholesale price</FieldLabel>
              </FieldContent>
              <Controller
                control={control}
                name="show_wholesale_price"
                render={({ field }) => (
                  <Switch id="variant-show_wholesale_price" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
            </Field>
            {isEditing && (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="variant-is_active">Active</FieldLabel>
                </FieldContent>
                <Controller
                  control={control}
                  name="is_active"
                  render={({ field }) => (
                    <Switch id="variant-is_active" checked={field.value} onCheckedChange={field.onChange} />
                  )}
                />
              </Field>
            )}
          </div>

          <div className="space-y-4 rounded-lg border border-border p-4">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="variant-is_preorder_enabled">Pre-order</FieldLabel>
                <FieldDescription>Allow customers to order before stock arrives.</FieldDescription>
              </FieldContent>
              <Controller
                control={control}
                name="is_preorder_enabled"
                render={({ field }) => (
                  <Switch id="variant-is_preorder_enabled" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
            </Field>
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
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="variant-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {isEditing ? "Save variant" : "Create variant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
