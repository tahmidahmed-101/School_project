import { useEffect, useId, useMemo } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { moneySchema, reportFormError } from "@/lib/forms"

import { bulkUpdateVariants, createProduct, updateProduct } from "../api"
import type { Product } from "../types"
import { refusalMessage } from "../lib/options"
import {
  baseDefaults,
  basePayload,
  baseShape,
  baseValuesOf,
  checkSpecs,
  optionsCreatePayload,
  optionsReady,
  reportedRefusal,
  saveOptionsIfChanged,
} from "../lib/productFormBase"
import { uploadStagedImages, useStagedImages } from "../lib/stagedImages"
import type { CategoryOption } from "../lib/useCategoryOptions"
import { useOptionDrafts } from "../lib/useOptionDrafts"
import { PricingFields } from "./PricingFields"
import { BasicsCard, PricingCard, ProductFormImages, ProductFormShell, SpecsCard } from "./ProductFormParts"
import { NewCombinationsCard, ProductOptionsCard } from "./ProductOptionsCard"

const schema = z
  .object({ ...baseShape, discount_price: moneySchema })
  .refine((v) => !v.discount_price || (v.price !== "" && Number(v.discount_price) < Number(v.price)), {
    path: ["discount_price"],
    message: "Discount price must be lower than the price",
  })
  .superRefine(checkSpecs)

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
  const options = useOptionDrafts(product)

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
    if (!optionsReady(options, isEditing)) return
    const payload = basePayload(values)
    try {
      if (product) {
        // With options the prices are per variant; without, only what was changed is sent.
        if (!options.hadOptions) {
          if (values.price && dirtyFields.price) payload.price = values.price
          if (values.cost_price && dirtyFields.cost_price) payload.cost_price = values.cost_price
          if (dirtyFields.discount_price) payload.discount_price = values.discount_price || null
        }
        payload.is_active = values.is_active
        await updateProduct(product.id, payload)
        if (!(await saveOptionsIfChanged(product.id, options))) return
        toast.success(`${values.name} updated`)
        navigate(`/product_detail/${product.id}`)
        return
      }
      const withOptions = options.active.length > 0
      payload.price = values.price
      if (values.cost_price) payload.cost_price = values.cost_price
      if (withOptions) Object.assign(payload, optionsCreatePayload(options))
      else {
        payload.discount_price = values.discount_price || null
        if (values.sku) payload.sku = values.sku
      }
      const created = await createProduct(payload)
      const failed: string[] = []
      if (withOptions && values.discount_price) {
        try {
          await bulkUpdateVariants(created.id, { discount_price: values.discount_price })
        } catch (err) {
          failed.push("the discount price")
          toast.error(refusalMessage(err, "The discount price could not be set on the variants"))
        }
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
        kind="stock"
        product={product}
        formId={formId}
        onSubmit={handleSubmit(onSubmit)}
        submitting={isSubmitting}
      >
        <BasicsCard kind="stock" isEditing={isEditing} categoryOptions={categoryOptions} />
        <ProductOptionsCard state={options} kind="stock" />
        <PricingCard
          isEditing={isEditing}
          withOptions={options.enabled}
          perVariant={options.hadOptions}
          simpleHint="Required. The price creates the product's first variant, so it can be stocked, sold and shown on the storefront."
        >
          <PricingFields register={register} errors={errors} />
        </PricingCard>
        {!isEditing && <NewCombinationsCard state={options} />}
        <SpecsCard />
        <ProductFormImages product={product} staged={staged} />
      </ProductFormShell>
    </FormProvider>
  )
}
