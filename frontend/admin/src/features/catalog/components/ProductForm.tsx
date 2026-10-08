import { useEffect, useId, useMemo, useState } from "react"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { CalendarClock, Layers, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { DetailPageState } from "@/components/common/DetailPageState"
import { PageHeader } from "@/components/common/PageHeader"
import { SwitchField } from "@/components/common/FormDialog"
import { FormActions } from "@/components/common/FormActions"
import { NoPermission } from "@/components/common/NoPermission"
import { DateField, FormField, MoneyField, SelectField, TextField, TextareaField } from "@/components/common/form-fields"
import { Combobox } from "@/components/common/ComboBox"
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/format"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { getApiErrorMessage } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { moneySchema, reportFormError } from "@/lib/forms"
import type { Option } from "@/lib/types"

import { fetchSingle } from "../slices/productSlice"
import { PricingFields } from "./PricingFields"
import {
  createProduct,
  createVariant,
  fetchAllBrands,
  updateProduct,
  updateVariant,
} from "../api"
import type { Product, ProductPayload, ProductVariantPayload } from "../types"
import { uploadStagedImages, useStagedImages } from "../lib/stagedImages"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { CategoryTreeSelect } from "./CategoryTreeSelect"
import { ProductImagesSection } from "./ProductImagesSection"
import { StagedImagesCard } from "./StagedImagesCard"

const schema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    category_id: z.string().min(1, "Choose a category"),
    /** "" means no brand. */
    brand_id: z.string(),
    featured: z.boolean(),
    product_type: z.enum(["simple", "variant"]),
    description: z.string(),
    highlights: z.string(),
    meta_keywords: z.string(),
    price: moneySchema,
    cost_price: moneySchema,
    discount_price: moneySchema,
    sku: z.string().trim(),
    is_active: z.boolean(),
    /** Sell the product's variants as pre-orders (the settings are stored on each variant). */
    is_preorder: z.boolean(),
    preorder_price: moneySchema,
    preorder_start_date: z.string(),
    preorder_end_date: z.string(),
    release_date: z.string(),
    preorder_stock_limit: z.string().refine((v) => v === "" || /^\d+$/.test(v), "Whole number"),
    /** Create only: variants queued to be added once the product exists. */
    variants: z.array(
      z.object({ color: z.string().trim(), size: z.string().trim(), sku: z.string().trim(), price: moneySchema })
    ),
  })
  .refine((v) => !v.discount_price || (v.price !== "" && Number(v.discount_price) < Number(v.price)), {
    path: ["discount_price"],
    message: "Discount price must be lower than the price",
  })
  .superRefine((v, ctx) => {
    if (!v.is_preorder) return
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message })
    const queuedPrices = v.product_type === "variant" && v.variants.length > 0 && v.variants.every((r) => r.price)
    if (!v.price && !queuedPrices) issue("price", "A pre-order product needs a price")
    // The storefront only takes pre-orders inside the start / end window, so both are required.
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
  .superRefine((v, ctx) => {
    if (v.product_type !== "variant") return
    const seen = new Set<string>()
    v.variants.forEach((row, i) => {
      if (!row.color && !row.size) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "color"], message: "Enter a colour or a size" })
        return
      }
      // The backend rejects a repeated colour + size combination on one product.
      const combo = `${row.color.toLowerCase()}|${row.size.toLowerCase()}`
      if (seen.has(combo)) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "color"], message: "Duplicate colour and size" })
      }
      seen.add(combo)
      if (!row.price && !v.price) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "price"], message: "Set a price here or under Pricing" })
      }
    })
  })

type FormValues = z.infer<typeof schema>

/**
 * A product is only listed on the storefront once it has a variant, and a simple product's one
 * variant is created from the price, so a simple product needs a price. A variant product does
 * not: its colours and sizes carry the prices (queued below, or generated on the detail page), and
 * a price here would add an extra variant with no colour or size. (When editing a product that
 * already has variants this rule is skipped: their prices are already set.)
 */
const schemaWithRequiredPrice = schema.superRefine((v, ctx) => {
  if (v.product_type === "simple" && !v.price) {
    ctx.addIssue({
      code: "custom",
      path: ["price"],
      message: "Enter a price. Without one the product is not shown on the storefront.",
    })
  }
})

const PREORDER_FIELDS = [
  "is_preorder",
  "preorder_price",
  "preorder_start_date",
  "preorder_end_date",
  "release_date",
  "preorder_stock_limit",
] as const

/** The variant fields that carry the form's pre-order settings. */
const preorderPayload = (values: FormValues): ProductVariantPayload => ({
  is_preorder_enabled: values.is_preorder,
  preorder_price: values.preorder_price || null,
  preorder_start_date: fromDatetimeLocal(values.preorder_start_date),
  preorder_end_date: fromDatetimeLocal(values.preorder_end_date),
  release_date: fromDatetimeLocal(values.release_date),
  preorder_stock_limit: values.preorder_stock_limit === "" ? null : Number(values.preorder_stock_limit),
})

const ProductForm = () => {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id && id !== "new")
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((s) => s.products)
  const product = singleData as Product | null
  const { options: categoryOptions } = useCategoryOptions()

  // Brands for the searchable picker. A failed load just leaves the list empty: brand is optional.
  const [brandOptions, setBrandOptions] = useState<Option[]>([])
  useEffect(() => {
    let cancelled = false
    fetchAllBrands()
      .then((brands) => {
        if (!cancelled) setBrandOptions(brands.map((b) => ({ label: b.name, value: b.id })))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useDocumentTitle(isEditing ? (product?.name ? `Edit ${product.name}` : "Edit Product") : "Add Product")

  // Editing a product that already has variants: pricing lives on them, so a blank price is fine.
  const hasVariants = isEditing && product?.id === id && (product?.variants.length ?? 0) > 0
  const formResolver = useMemo(() => zodResolver(hasVariants ? schema : schemaWithRequiredPrice), [hasVariants])

  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormValues>({
    resolver: formResolver,
    defaultValues: {
      name: "",
      category_id: "",
      product_type: "simple",
      description: "",
      highlights: "",
      meta_keywords: "",
      price: "",
      cost_price: "",
      discount_price: "",
      sku: "",
      is_active: true,
      brand_id: "",
      featured: false,
      is_preorder: false,
      preorder_price: "",
      preorder_start_date: "",
      preorder_end_date: "",
      release_date: "",
      preorder_stock_limit: "",
      variants: [],
    },
  })
  const formId = useId()
  const variantRows = useFieldArray({ control, name: "variants" })
  const productType = useWatch({ control, name: "product_type" })
  const isPreorder = useWatch({ control, name: "is_preorder" })

  // Create only: images picked before the product exists, uploaded right after it is created.
  const staged = useStagedImages()

  useEffect(() => {
    if (isEditing && id) dispatch(fetchSingle(id))
  }, [dispatch, id, isEditing])

  useEffect(() => {
    if (isEditing && product && product.id === id) {
      // Pre-order settings are per variant; the form shows those of a pre-order variant if there is one.
      const preorderSource = product.variants.find((v) => v.is_preorder_enabled) ?? product.variants[0]
      // The product is refetched whenever an image changes below; keepDirtyValues stops
      // that refetch from wiping edits the user has not saved yet.
      reset(
        {
          name: product.name,
          category_id: product.category_id,
          product_type: product.product_type === "variant" ? "variant" : "simple",
          description: product.description ?? "",
          highlights: (product.highlights ?? []).join("\n"),
          meta_keywords: product.meta_keywords ?? "",
          price: product.price ?? "",
          cost_price: product.cost_price ?? "",
          discount_price: product.discount_price ?? "",
          sku: "",
          is_active: product.is_active,
          brand_id: product.brand_id ?? "",
          featured: product.featured,
          is_preorder: Boolean(preorderSource?.is_preorder_enabled),
          preorder_price: preorderSource?.preorder_price ?? "",
          preorder_start_date: toDatetimeLocal(preorderSource?.preorder_start_date),
          preorder_end_date: toDatetimeLocal(preorderSource?.preorder_end_date),
          release_date: toDatetimeLocal(preorderSource?.release_date),
          preorder_stock_limit:
            preorderSource?.preorder_stock_limit != null ? String(preorderSource.preorder_stock_limit) : "",
          variants: [],
        },
        { keepDirtyValues: true }
      )
    }
  }, [product, id, isEditing, reset])

  if (!canManage) {
    return (
      <NoPermission message="You don't have permission to edit products." backTo="/products" backLabel="Back to products" />
    )
  }

  const pageState = isEditing ? resolveDetailState(singleStatus, singleError, product?.id === id) : null
  if (pageState) {
    return (
      <DetailPageState
        state={pageState}
        entity="Product"
        backTo="/products"
        backLabel="Back to Products"
        error={singleError}
        onRetry={() => id && dispatch(fetchSingle(id))}
      />
    )
  }

  if (isEditing && product?.product_type === "bundle") {
    const bundleId = product.variants[0]?.id
    return (
      <div className="section-container py-16 text-center text-sm text-muted-foreground">
        Bundles are edited from the Bundles page.{" "}
        <Link className="text-primary underline" to={bundleId ? `/bundles/${bundleId}` : "/bundles"}>
          Open bundle editor
        </Link>
      </div>
    )
  }

  const onSubmit = async (values: FormValues) => {
    const payload: ProductPayload = {
      name: values.name,
      category_id: values.category_id,
      brand_id: values.brand_id || null,
      featured: values.featured,
      product_type: values.product_type,
      description: values.description,
      highlights: values.highlights
        .split("\n")
        .map((h) => h.trim())
        .filter(Boolean),
      meta_keywords: values.meta_keywords,
    }
    // On edit, pricing fans out to every variant server-side — only send what was changed.
    const touched = (f: "price" | "cost_price" | "discount_price") => !isEditing || Boolean(dirtyFields[f])
    if (values.price && touched("price")) payload.price = values.price
    if (values.cost_price && touched("cost_price")) payload.cost_price = values.cost_price
    if (touched("discount_price")) payload.discount_price = values.discount_price || null

    try {
      if (isEditing && id) {
        payload.is_active = values.is_active
        await updateProduct(id, payload)
        const preorderChanged = PREORDER_FIELDS.some((f) => dirtyFields[f])
        if (preorderChanged && product) {
          const results = await Promise.allSettled(
            product.variants.map((v) => updateVariant(v.id, preorderPayload(values)))
          )
          const failed = results.find((r) => r.status === "rejected")
          if (failed) {
            toast.error(getApiErrorMessage(failed.reason, "Pre-order settings could not be saved on every variant"))
            return
          }
        }
        toast.success(`${values.name} updated`)
        navigate(`/product_detail/${id}`)
      } else {
        let queued = values.product_type === "variant" ? values.variants : []
        // Pre-order settings live on the variant, and the product endpoint can't set them on the
        // variant it creates, so the single default variant is created here instead.
        if (values.is_preorder && !queued.length) queued = [{ color: "", size: "", sku: values.sku, price: "" }]
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
        // The product now exists, so a failure below is reported and left to be retried
        // from the detail page rather than failing the whole form.
        const failures = await addVariantsAndImages(created.id, values, queued)
        if (failures) toast.warning(`${values.name} created, but ${failures} could not be added`)
        else toast.success(`${values.name} created`)
        navigate(`/product_detail/${created.id}`)
      }
    } catch (err) {
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to save product" })
    }
  }

  /** Adds the queued variants and images to a just-created product; returns a summary of failures, if any. */
  const addVariantsAndImages = async (productId: string, values: FormValues, queued: FormValues["variants"]) => {
    let failedVariants = 0
    for (const row of queued) {
      const ownPrice = Boolean(row.price)
      try {
        await createVariant(productId, {
          color: row.color,
          size: row.size,
          price: row.price || values.price,
          ...(row.sku ? { sku: row.sku } : {}),
          ...(values.cost_price ? { cost_price: values.cost_price } : {}),
          // The discount was validated against the product price, not a per-variant one.
          ...(!ownPrice && values.discount_price ? { discount_price: values.discount_price } : {}),
          ...(values.is_preorder ? preorderPayload(values) : {}),
        })
      } catch (err) {
        failedVariants += 1
        const label = [row.color, row.size].filter(Boolean).join(" / ") || "(default)"
        toast.error(`Variant ${label}: ${getApiErrorMessage(err, "could not be created")}`)
      }
    }

    const failedImages = await uploadStagedImages(productId, staged.images)

    const parts = [
      failedVariants && `${failedVariants} variant${failedVariants === 1 ? "" : "s"}`,
      failedImages && `${failedImages} image${failedImages === 1 ? "" : "s"}`,
    ].filter(Boolean)
    return parts.join(" and ")
  }

  const hasQueuedVariants = !isEditing && productType === "variant" && variantRows.fields.length > 0

  const backTo = isEditing ? `/product_detail/${id}` : "/products"

  return (
    <div className="section-container">
      <PageHeader
        title={isEditing ? "Edit Product" : "Add Product"}
        description={isEditing ? `Editing ${product?.name ?? ""}` : undefined}
        back={{ to: backTo, label: "Back" }}
      />

      <form id={formId} onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Basic information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <TextField
              className="md:col-span-2"
              label="Product name"
              id="name"
              placeholder="e.g. Oversized Graphic Tee"
              error={errors.name}
              {...register("name")}
            />

            <Field>
              <FieldLabel htmlFor="category_id">Category</FieldLabel>
              <FieldContent>
                <CategoryTreeSelect
                  control={control}
                  name="category_id"
                  id="category_id"
                  options={categoryOptions}
                  placeholder="Choose a category"
                />
                <FieldError errors={[errors.category_id]} />
              </FieldContent>
            </Field>

            <SelectField
              control={control}
              name="product_type"
              label="Product type"
              id="product_type"
              description={<>Bundles are created from <Link to="/bundles/new" className="text-primary underline">Bundles</Link>.</>}
              options={[{ label: "Simple — one sellable SKU", value: "simple" }, { label: "Variant — colours / sizes", value: "variant" }]}
            />

            <FormField label="Brand" htmlFor="brand_id" description="Optional. Type to search.">
              <Controller
                control={control}
                name="brand_id"
                render={({ field }) => (
                  <Combobox
                    id="brand_id"
                    placeholder="No brand"
                    options={brandOptions}
                    value={brandOptions.find((o) => o.value === field.value) ?? null}
                    onValueChange={(option) => field.onChange(option?.value ?? "")}
                  />
                )}
              />
            </FormField>

            <div className="self-center">
              <SwitchField control={control} name="featured" label="Featured" />
            </div>

            <TextField
              className="md:col-span-2"
              label="Meta keywords"
              id="meta_keywords"
              placeholder="comma, separated, keywords"
              error={errors.meta_keywords}
              {...register("meta_keywords")}
            />

            <TextareaField
              className="md:col-span-2"
              label="Description"
              id="description"
              rows={4}
              error={errors.description}
              {...register("description")}
            />

            <TextareaField
              className="md:col-span-2"
              label="Highlights"
              id="highlights"
              rows={4}
              placeholder="One highlight per line"
              error={errors.highlights}
              {...register("highlights")}
            />

            {isEditing && (
              <SwitchField
                control={control}
                name="is_active"
                label="Active"
                description="Inactive products are hidden from the storefront."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
            <CardDescription>
              {isEditing
                ? "Price changes apply to every live variant of this product."
                : hasQueuedVariants
                  ? "Applies to every variant below unless a variant sets its own price."
                  : productType === "variant"
                    ? "Optional for a variant product: add its colours and sizes below, or generate them from the product page."
                    : "Required. The price creates the product's first variant, so it can be stocked, sold and shown on the storefront."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <PricingFields register={register} errors={errors} />
            {!isEditing && !hasQueuedVariants && (
              <TextField
                label="SKU"
                id="sku"
                placeholder="Auto-generated if blank"
                error={errors.sku}
                {...register("sku")}
              />
            )}
          </CardContent>
        </Card>

        {!isEditing && (
          <StagedImagesCard
            images={staged.images}
            onAdd={staged.add}
            onRemove={staged.remove}
            onMove={staged.move}
            description="Uploaded when the product is created, in the order shown. Use the arrows to reorder; the first image is the main one."
          />
        )}

        {isEditing && product && (
          // The gallery saves on its own; Enter in one of its inputs commits that field
          // instead of submitting the product form around it.
          <div
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
                e.preventDefault()
                e.target.blur()
              }
            }}
          >
            <ProductImagesSection
              productId={product.id}
              variants={product.variants}
              canManage={canManage}
              onChanged={() => dispatch(fetchSingle(product.id))}
            />
          </div>
        )}

        {(!isEditing || (product?.variants.length ?? 0) > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4" /> Pre-order
              </CardTitle>
              <CardDescription>
                {isEditing
                  ? "Let customers order before stock arrives. Saving applies these settings to every variant of this product."
                  : "Let customers order before stock arrives. Applies to every variant created with this product."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SwitchField control={control} name="is_preorder" label="Sell this product as a pre-order" />
              {isPreorder && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
                  <DateField
                    withTime
                    label="Release date"
                    error={errors.release_date}
                    {...register("release_date")}
                  />
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
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!isEditing && productType === "variant" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="size-4" /> Variants
              </CardTitle>
              <CardDescription>
                One row per colour / size combination. Leave SKU blank to auto-generate it, and price blank to use
                the price above.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {variantRows.fields.map((row, i) => (
                <div key={row.id} className="grid grid-cols-2 items-start gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                  <Field>
                    <FieldContent>
                      <Input aria-label="Colour" placeholder="Colour" {...register(`variants.${i}.color`)} />
                      <FieldError errors={[errors.variants?.[i]?.color]} />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldContent>
                      <Input aria-label="Size" placeholder="Size" {...register(`variants.${i}.size`)} />
                      <FieldError errors={[errors.variants?.[i]?.size]} />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldContent>
                      <Input aria-label="SKU" placeholder="SKU (auto)" {...register(`variants.${i}.sku`)} />
                      <FieldError errors={[errors.variants?.[i]?.sku]} />
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldContent>
                      <Input
                        aria-label="Price"
                        inputMode="decimal"
                        placeholder="Price (optional)"
                        {...register(`variants.${i}.price`)}
                      />
                      <FieldError errors={[errors.variants?.[i]?.price]} />
                    </FieldContent>
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove variant"
                    className="col-span-2 justify-self-end md:col-span-1"
                    onClick={() => variantRows.remove(i)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => variantRows.append({ color: "", size: "", sku: "", price: "" })}
              >
                <Plus className="size-4" /> Add variant
              </Button>
            </CardContent>
          </Card>
        )}
      </form>

      <FormActions
        sticky
        form={formId}
        onCancel={() => navigate(backTo)}
        submitLabel={isEditing ? "Save changes" : "Create product"}
        submitting={isSubmitting}
      />
    </div>
  )
}

export default ProductForm
