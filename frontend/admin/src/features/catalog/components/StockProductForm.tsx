import { useEffect, useId, useMemo } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { moneySchema, reportFormError } from "@/lib/forms"

import { createProduct, updateProduct } from "../api"
import type { Product } from "../types"
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
import { PricingFields } from "./PricingFields"
import {
  BasicsCard,
  PricingCard,
  ProductFormImages,
  ProductFormShell,
  SavedVariants,
} from "./ProductFormParts"

const schema = z
  .object({ ...baseShape, discount_price: moneySchema })
  .refine((v) => !v.discount_price || (v.price !== "" && Number(v.discount_price) < Number(v.price)), {
    path: ["discount_price"],
    message: "Discount price must be lower than the price",
  })

type FormValues = z.infer<typeof schema>

// The price creates the product's variants, and without a variant the product is not listed.
const schemaWithRequiredPrice = schema.superRefine((v, ctx) => {
  if (!v.price) {
    ctx.addIssue({
      code: "custom",
      path: ["price"],
      message: "Enter a price. Without one the product is not shown on the storefront.",
    })
  }
})

/** Add / edit a product sold from stock. */
export function StockProductForm({
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

  // Editing a product that already has variants: pricing lives on them, so a blank price is fine.
  const hasVariants = (product?.variants.length ?? 0) > 0
  const resolver = useMemo(() => zodResolver(hasVariants ? schema : schemaWithRequiredPrice), [hasVariants])
  const form = useForm<FormValues>({ resolver, defaultValues: { ...baseDefaults, discount_price: "" } })
  const {
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, dirtyFields },
  } = form

  useEffect(() => {
    // The product is refetched whenever an image changes; keepDirtyValues keeps unsaved edits.
    if (product) {
      reset({ ...baseValuesOf(product), discount_price: product.discount_price ?? "" }, { keepDirtyValues: true })
    }
  }, [product, reset])

  const onSubmit = async (values: FormValues) => {
    const payload = basePayload(values)
    try {
      if (product) {
        // With options the prices are per variant; without, only what was changed is sent.
        if (!hasOptions) {
          if (values.price && dirtyFields.price) payload.price = values.price
          if (values.cost_price && dirtyFields.cost_price) payload.cost_price = values.cost_price
          if (dirtyFields.discount_price) payload.discount_price = values.discount_price || null
        }
        payload.is_active = values.is_active
        await updateProduct(product.id, payload)
        toast.success(`${values.name} updated`)
        navigate(`/product_detail/${product.id}`)
        return
      }
      payload.is_active = values.is_active
      payload.price = values.price
      if (values.cost_price) payload.cost_price = values.cost_price
      payload.discount_price = values.discount_price || null
      if (values.sku) payload.sku = values.sku
      const created = await createProduct(payload)
      const failed: string[] = []
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
        product={product}
        formId={formId}
        onSubmit={handleSubmit(onSubmit)}
        submitting={isSubmitting}
        after={product && <SavedVariants product={product} />}
      >
        <BasicsCard categoryOptions={categoryOptions} />
        <PricingCard
          isEditing={isEditing}
          perVariant={hasOptions}
          simpleHint="Required. The price creates the product's first variant, so it can be stocked, sold and shown on the storefront."
        >
          <PricingFields register={register} errors={errors} />
        </PricingCard>
        <ProductFormImages product={product} staged={staged} />
      </ProductFormShell>
    </FormProvider>
  )
}
