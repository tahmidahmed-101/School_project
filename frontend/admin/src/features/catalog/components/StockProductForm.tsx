import { useEffect, useId, useMemo } from "react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { moneySchema, reportFormError } from "@/lib/forms"

import { createProduct, updateProduct } from "../api"
import type { Product } from "../types"
import {
  addVariantsAndImages,
  baseDefaults,
  basePayload,
  baseShape,
  baseValuesOf,
  checkQueuedVariants,
} from "../lib/productFormBase"
import { useStagedImages } from "../lib/stagedImages"
import type { CategoryOption } from "../lib/useCategoryOptions"
import { PricingFields } from "./PricingFields"
import {
  BasicsCard,
  PricingCard,
  ProductFormImages,
  ProductFormShell,
  QueuedVariantsCard,
} from "./ProductFormParts"

const schema = z
  .object({ ...baseShape, discount_price: moneySchema })
  .refine((v) => !v.discount_price || (v.price !== "" && Number(v.discount_price) < Number(v.price)), {
    path: ["discount_price"],
    message: "Discount price must be lower than the price",
  })
  .superRefine(checkQueuedVariants)

type FormValues = z.infer<typeof schema>

// A simple product's one variant is created from the price, and without a variant the product
// is not listed. A variant product's colours and sizes carry the prices instead.
const schemaWithRequiredPrice = schema.superRefine((v, ctx) => {
  if (v.product_type === "simple" && !v.price) {
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

  // Editing a product that already has variants: pricing lives on them, so a blank price is fine.
  const hasVariants = (product?.variants.length ?? 0) > 0
  const resolver = useMemo(() => zodResolver(hasVariants ? schema : schemaWithRequiredPrice), [hasVariants])
  const form = useForm<FormValues>({ resolver, defaultValues: { ...baseDefaults, discount_price: "" } })
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, dirtyFields },
  } = form
  const productType = useWatch({ control, name: "product_type" })
  const queuedCount = useWatch({ control, name: "variants" }).length
  const hasQueuedVariants = !isEditing && productType === "variant" && queuedCount > 0

  useEffect(() => {
    // The product is refetched whenever an image changes; keepDirtyValues keeps unsaved edits.
    if (product) {
      reset({ ...baseValuesOf(product), discount_price: product.discount_price ?? "" }, { keepDirtyValues: true })
    }
  }, [product, reset])

  const onSubmit = async (values: FormValues) => {
    const payload = basePayload(values)
    // On edit, pricing fans out to every variant server-side — only send what was changed.
    const touched = (f: "price" | "cost_price" | "discount_price") => !isEditing || Boolean(dirtyFields[f])
    if (values.price && touched("price")) payload.price = values.price
    if (values.cost_price && touched("cost_price")) payload.cost_price = values.cost_price
    if (touched("discount_price")) payload.discount_price = values.discount_price || null

    try {
      if (product) {
        payload.is_active = values.is_active
        await updateProduct(product.id, payload)
        toast.success(`${values.name} updated`)
        navigate(`/product_detail/${product.id}`)
        return
      }
      const queued = values.product_type === "variant" ? values.variants : []
      if (queued.length) {
        // A price on the product itself would create an extra variant with no colour or
        // size; the queued variants carry the pricing instead.
        delete payload.price
        delete payload.cost_price
        delete payload.discount_price
      } else {
        if (values.sku) payload.sku = values.sku
        if (!values.price) delete payload.discount_price
      }
      const created = await createProduct(payload)
      const failures = await addVariantsAndImages(
        created.id,
        queued,
        (row) => ({
          color: row.color,
          size: row.size,
          price: row.price || values.price,
          ...(row.sku ? { sku: row.sku } : {}),
          ...(values.cost_price ? { cost_price: values.cost_price } : {}),
          // The discount was validated against the product price, not a per-variant one.
          ...(!row.price && values.discount_price ? { discount_price: values.discount_price } : {}),
        }),
        staged.images
      )
      if (failures) toast.warning(`${values.name} created, but ${failures} could not be added`)
      else toast.success(`${values.name} created`)
      navigate(`/product_detail/${created.id}`)
    } catch (err) {
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to save product" })
    }
  }

  return (
    <FormProvider {...form}>
      <ProductFormShell
        kind="stock"
        product={product}
        formId={formId}
        onSubmit={handleSubmit(onSubmit)}
        submitting={isSubmitting}
      >
        <BasicsCard kind="stock" isEditing={isEditing} categoryOptions={categoryOptions} />
        <PricingCard
          isEditing={isEditing}
          hasQueuedVariants={hasQueuedVariants}
          simpleHint="Required. The price creates the product's first variant, so it can be stocked, sold and shown on the storefront."
        >
          <PricingFields register={register} errors={errors} />
        </PricingCard>
        <ProductFormImages product={product} staged={staged} />
        {!isEditing && productType === "variant" && <QueuedVariantsCard />}
      </ProductFormShell>
    </FormProvider>
  )
}
