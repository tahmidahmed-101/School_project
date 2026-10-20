import { useEffect, useId, useMemo } from "react"
import { settleInOrder } from "../lib/options"
import { FormProvider, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { CalendarClock } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DateField, MoneyField, TextField } from "@/components/common/form-fields"
import { getApiErrorMessage } from "@/lib/api/client"
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/format"
import { moneySchema, reportFormError } from "@/lib/forms"

import { createProduct, createVariant, updateProduct, updateVariant } from "../api"
import type { Product, ProductVariantPayload } from "../types"
import {
  baseDefaults,
  basePayload,
  baseShape,
  baseValuesOf,
  reportedRefusal,
} from "../lib/productFormBase"
import type { CategoryOption } from "../lib/useCategoryOptions"
import { uploadStagedImages, useStagedImages } from "../lib/stagedImages"
import { savedOptionsOf } from "../lib/productKind"
import {
  BasicsCard,
  PricingCard,
  ProductFormImages,
  ProductFormShell,
  SavedVariants,
} from "./ProductFormParts"

const SETTINGS_FIELDS = [
  "preorder_price",
  "preorder_start_date",
  "preorder_end_date",
  "release_date",
  "preorder_stock_limit",
  "preorder_min_quantity",
] as const

const fields = z.object({
  ...baseShape,
  preorder_price: moneySchema,
  preorder_start_date: z.string(),
  preorder_end_date: z.string(),
  release_date: z.string(),
  preorder_stock_limit: z.string().refine((v) => v === "" || /^\d+$/.test(v), "Whole number"),
  preorder_min_quantity: z.string().refine((v) => /^[1-9]\d*$/.test(v), "Whole number, at least 1"),
})
type FormValues = z.infer<typeof fields>

/** `priceRequired` is off on a saved product with options, where each variant has its own price. */
const windowSchema = (priceRequired: boolean) =>
  fields.superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message })
    if (priceRequired && !v.price) issue("price", "A pre-order product needs a price")
    // The storefront only takes pre-orders inside the open / close window, so both are required.
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

const settingsDefaults = {
  preorder_price: "",
  preorder_start_date: "",
  preorder_end_date: "",
  release_date: "",
  preorder_stock_limit: "",
  preorder_min_quantity: "1",
}

/** The pre-order settings are stored on each variant; the form shows one variant's and saves them to all. */
const settingsOf = (product: Product) => {
  const source = product.variants.find((v) => v.is_preorder_enabled) ?? product.variants[0]
  return {
    preorder_price: source?.preorder_price ?? "",
    preorder_start_date: toDatetimeLocal(source?.preorder_start_date),
    preorder_end_date: toDatetimeLocal(source?.preorder_end_date),
    release_date: toDatetimeLocal(source?.release_date),
    preorder_stock_limit: source?.preorder_stock_limit != null ? String(source.preorder_stock_limit) : "",
    preorder_min_quantity: String(source?.preorder_min_quantity ?? 1),
  }
}

const settingsPayload = (values: FormValues): ProductVariantPayload => ({
  is_preorder_enabled: true,
  preorder_price: values.preorder_price || null,
  preorder_start_date: fromDatetimeLocal(values.preorder_start_date),
  preorder_end_date: fromDatetimeLocal(values.preorder_end_date),
  release_date: fromDatetimeLocal(values.release_date),
  preorder_stock_limit: values.preorder_stock_limit === "" ? null : Number(values.preorder_stock_limit),
  preorder_min_quantity: Number(values.preorder_min_quantity),
})

/** Add / edit a product customers order before it arrives. */
export function PreorderProductForm({
  product,
  categoryOptions,
}: {
  product: Product | null
  categoryOptions: CategoryOption[]
}) {
  const isEditing = Boolean(product)
  const navigate = useNavigate()
  const formId = useId()
  const staged = useStagedImages()
  // Options and variants are managed on the product page; with options, each variant has its own price.
  const hasOptions = savedOptionsOf(product).length > 0

  // A saved product with no variant has nowhere to keep the settings, so they are not asked for.
  const noVariants = isEditing && product?.variants.length === 0
  const priceRequired = !hasOptions
  const resolver = useMemo(
    () => zodResolver(noVariants ? fields : windowSchema(priceRequired)),
    [noVariants, priceRequired]
  )
  const form = useForm<FormValues>({ resolver, defaultValues: { ...baseDefaults, ...settingsDefaults } })
  const {
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, dirtyFields },
  } = form

  useEffect(() => {
    // The product is refetched whenever an image changes; keepDirtyValues keeps unsaved edits.
    if (product) reset({ ...baseValuesOf(product), ...settingsOf(product) }, { keepDirtyValues: true })
  }, [product, reset])

  const onSubmit = async (values: FormValues) => {
    const payload = basePayload(values)
    try {
      if (product) {
        // With options the prices are per variant; without, only what was changed is sent.
        if (!hasOptions) {
          if (values.price && dirtyFields.price) payload.price = values.price
          if (values.cost_price && dirtyFields.cost_price) payload.cost_price = values.cost_price
        }
        payload.is_active = values.is_active
        await updateProduct(product.id, payload)
        if (SETTINGS_FIELDS.some((f) => dirtyFields[f])) {
          const results = await settleInOrder(product.variants, (v) => updateVariant(v.id, settingsPayload(values)))
          const failed = results.find((r) => r.status === "rejected")
          if (failed) {
            toast.error(getApiErrorMessage(failed.reason, "Pre-order settings could not be saved on every variant"))
            return
          }
        }
        toast.success(`${values.name} updated`)
        navigate(`/product_detail/${product.id}`)
        return
      }
      const pricing = { price: values.price, ...(values.cost_price ? { cost_price: values.cost_price } : {}) }
      const failed: string[] = []
      // The product endpoint cannot set pre-order settings on the variant it creates from a
      // price, so the single variant is created here instead.
      const created = await createProduct({ ...payload, is_active: values.is_active })
      try {
        await createVariant(created.id, {
          ...pricing,
          ...(values.sku ? { sku: values.sku } : {}),
          ...settingsPayload(values),
        })
      } catch (err) {
        failed.push("its price and ordering window")
        toast.error(getApiErrorMessage(err, "The variant could not be created"))
      }
      const failedImages = await uploadStagedImages(created.id, staged.images)
      if (failedImages) failed.push(`${failedImages} image${failedImages === 1 ? "" : "s"}`)
      if (failed.length) toast.warning(`${values.name} created, but ${failed.join(" and ")} could not be added`)
      else toast.success(`${values.name} created`)
      navigate(`/product_detail/${created.id}`)
    } catch (err) {
      if (reportedRefusal(err)) return
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to save product" })
    }
  }

  return (
    <FormProvider {...form}>
      <ProductFormShell
        kind="preorder"
        product={product}
        formId={formId}
        onSubmit={handleSubmit(onSubmit)}
        submitting={isSubmitting}
        after={product && <SavedVariants product={product} kind="preorder" />}
      >
        <BasicsCard kind="preorder" categoryOptions={categoryOptions} />
        <PricingCard
          isEditing={isEditing}
          perVariant={hasOptions}
          simpleHint="Required. The price creates the product's first variant, so it can be ordered and shown on the storefront."
        >
          <MoneyField label="Price" showCurrency id="price" placeholder="0.00" error={errors.price} {...register("price")} />
          <MoneyField
            label="Cost price"
            id="cost_price"
            placeholder="0.00"
            error={errors.cost_price}
            {...register("cost_price")}
          />
        </PricingCard>

        {noVariants ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              This product has no variant yet. Add one on the product page; the opening and closing dates are set
              there.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4" /> Ordering window
              </CardTitle>
              <CardDescription>
                Customers can order between the opening and closing dates. These settings apply to every variant.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DateField
                withTime
                label="Pre-orders open *"
                error={errors.preorder_start_date}
                {...register("preorder_start_date")}
              />
              <DateField
                withTime
                label="Pre-orders close *"
                error={errors.preorder_end_date}
                {...register("preorder_end_date")}
              />
              <DateField withTime label="Release date" error={errors.release_date} {...register("release_date")} />
              <MoneyField
                label="Pre-order price"
                placeholder="Optional"
                error={errors.preorder_price}
                {...register("preorder_price")}
              />
              <TextField
                label="Pre-order limit"
                inputMode="numeric"
                placeholder="Unlimited"
                error={errors.preorder_stock_limit}
                {...register("preorder_stock_limit")}
              />
              <TextField
                label="Minimum per order"
                inputMode="numeric"
                placeholder="1"
                error={errors.preorder_min_quantity}
                {...register("preorder_min_quantity")}
              />
            </CardContent>
          </Card>
        )}

        <ProductFormImages product={product} staged={staged} />
      </ProductFormShell>
    </FormProvider>
  )
}
