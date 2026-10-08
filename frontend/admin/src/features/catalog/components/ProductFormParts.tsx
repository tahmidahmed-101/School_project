import { useEffect, useState, type FormEventHandler, type ReactNode } from "react"
import { Controller, useFieldArray, useFormContext } from "react-hook-form"
import { Link, useNavigate } from "react-router-dom"
import { Layers, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { PageHeader } from "@/components/common/PageHeader"
import { SwitchField } from "@/components/common/FormDialog"
import { FormActions } from "@/components/common/FormActions"
import { FormField, SelectField, TextField, TextareaField } from "@/components/common/form-fields"
import { Combobox } from "@/components/common/ComboBox"
import { useAppDispatch } from "@/app/hooks"
import type { Kind } from "@/hooks/use-kind"
import type { Option } from "@/lib/types"

import { fetchSingle } from "../slices/productSlice"
import { fetchAllBrands } from "../api"
import type { Product } from "../types"
import type { BaseValues } from "../lib/productFormBase"
import { productListPath } from "../lib/productKind"
import type { useStagedImages } from "../lib/stagedImages"
import type { CategoryOption } from "../lib/useCategoryOptions"
import { CategoryTreeSelect } from "./CategoryTreeSelect"
import { ProductImagesSection } from "./ProductImagesSection"
import { StagedImagesCard } from "./StagedImagesCard"

/** Brands for the searchable picker. A failed load just leaves the list empty: brand is optional. */
function useBrandOptions(kind: Kind) {
  const [options, setOptions] = useState<Option[]>([])
  useEffect(() => {
    let cancelled = false
    fetchAllBrands(kind)
      .then((brands) => {
        if (!cancelled) setOptions(brands.map((b) => ({ label: b.name, value: b.id })))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [kind])
  return options
}

/** Page header, the form element and the sticky save bar. */
export function ProductFormShell({
  kind,
  product,
  formId,
  onSubmit,
  submitting,
  children,
}: {
  kind: Kind
  /** The product being edited; null on a new one. */
  product: Product | null
  formId: string
  onSubmit: FormEventHandler<HTMLFormElement>
  submitting: boolean
  children: ReactNode
}) {
  const navigate = useNavigate()
  const noun = kind === "preorder" ? "pre-order product" : "product"
  const backTo = product ? `/product_detail/${product.id}` : productListPath(kind)
  return (
    <div className="section-container">
      <PageHeader
        title={product ? `Edit ${noun}` : `Add ${noun}`}
        description={product ? `Editing ${product.name}` : undefined}
        back={{ to: backTo, label: "Back" }}
      />
      <form id={formId} onSubmit={onSubmit} className="space-y-6">
        {children}
      </form>
      <FormActions
        sticky
        form={formId}
        onCancel={() => navigate(backTo)}
        submitLabel={product ? "Save changes" : "Create product"}
        submitting={submitting}
      />
    </div>
  )
}

export function BasicsCard({
  kind,
  isEditing,
  categoryOptions,
}: {
  kind: Kind
  isEditing: boolean
  /** Categories of this form's kind only. */
  categoryOptions: CategoryOption[]
}) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<BaseValues>()
  const brandOptions = useBrandOptions(kind)
  return (
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
          description={
            kind === "stock" ? (
              <>
                Bundles are created from{" "}
                <Link to="/bundles/new" className="text-primary underline">
                  Bundles
                </Link>
                .
              </>
            ) : undefined
          }
          options={[
            { label: "Simple — one sellable SKU", value: "simple" },
            { label: "Variant — colours / sizes", value: "variant" },
          ]}
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
  )
}

/** The Pricing card: the form's own money fields as children, then the SKU of a new product's first variant. */
export function PricingCard({
  isEditing,
  hasQueuedVariants,
  simpleHint,
  children,
}: {
  isEditing: boolean
  hasQueuedVariants: boolean
  /** Shown on a new simple product, where the price is required. */
  simpleHint: string
  children: ReactNode
}) {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<BaseValues>()
  const productType = watch("product_type")
  return (
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
                : simpleHint}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {children}
        {!isEditing && !hasQueuedVariants && (
          <TextField label="SKU" id="sku" placeholder="Auto-generated if blank" error={errors.sku} {...register("sku")} />
        )}
      </CardContent>
    </Card>
  )
}

/** A new product stages its images until it exists; a saved one edits its gallery directly. */
export function ProductFormImages({
  product,
  staged,
}: {
  product: Product | null
  staged: ReturnType<typeof useStagedImages>
}) {
  const dispatch = useAppDispatch()
  if (!product) {
    return (
      <StagedImagesCard
        images={staged.images}
        onAdd={staged.add}
        onRemove={staged.remove}
        onMove={staged.move}
        description="Uploaded when the product is created, in the order shown. Use the arrows to reorder; the first image is the main one."
      />
    )
  }
  return (
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
        canManage
        onChanged={() => dispatch(fetchSingle(product.id))}
      />
    </div>
  )
}

/** Create only: one row per colour / size combination of a variant product. */
export function QueuedVariantsCard() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<BaseValues>()
  const rows = useFieldArray({ control, name: "variants" })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="size-4" /> Variants
        </CardTitle>
        <CardDescription>
          One row per colour / size combination. Leave SKU blank to auto-generate it, and price blank to use the
          price above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.fields.map((row, i) => (
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
              onClick={() => rows.remove(i)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => rows.append({ color: "", size: "", sku: "", price: "" })}
        >
          <Plus className="size-4" /> Add variant
        </Button>
      </CardContent>
    </Card>
  )
}
