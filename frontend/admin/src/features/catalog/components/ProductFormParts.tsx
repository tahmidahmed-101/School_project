import { useEffect, useState, type FormEventHandler, type ReactNode } from "react"
import { Controller, useFormContext } from "react-hook-form"
import { useNavigate } from "react-router-dom"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { PageHeader } from "@/components/common/PageHeader"
import { SwitchField } from "@/components/common/FormDialog"
import { FormActions } from "@/components/common/FormActions"
import { FormField, TextField, TextareaField } from "@/components/common/form-fields"
import { Combobox } from "@/components/common/ComboBox"
import { useAppDispatch } from "@/app/hooks"
import type { Option } from "@/lib/types"

import { fetchSingle } from "../slices/productSlice"
import { fetchAllBrands } from "../api"
import type { Product } from "../types"
import type { BaseValues } from "../lib/productFormBase"
import type { useStagedImages } from "../lib/stagedImages"
import { savedOptionsOf } from "../lib/productKind"
import type { CategoryOption } from "../lib/useCategoryOptions"
import { CategoryTreeCombobox } from "./CategoryTreeSelect"
import { ProductImagesSection } from "./ProductImagesSection"
import { ProductVariantsSection } from "./ProductVariantsSection"
import { StagedImagesCard } from "./StagedImagesCard"

/** The on/off settings at the foot of the Basics card, in display order. */
const PRODUCT_SWITCHES = [
  { name: "is_active", label: "Publish", description: "Listed on the storefront." },
  { name: "featured", label: "Featured", description: "Shown in the storefront's featured sections." },
  { name: "show_questions", label: "Questions", description: "Customers can ask about it on the product page." },
  { name: "show_price_report", label: "Price report", description: "Customers can report a wrong price." },
] as const satisfies readonly { name: keyof BaseValues; label: string; description: string }[]

/** Brands for the searchable picker. A failed load just leaves the list empty: brand is optional. */
function useBrandOptions() {
  const [options, setOptions] = useState<Option[]>([])
  useEffect(() => {
    let cancelled = false
    fetchAllBrands()
      .then((brands) => {
        if (!cancelled) setOptions(brands.map((b) => ({ label: b.name, value: b.id })))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return options
}

/** Page header, the form element and the sticky save bar. */
export function ProductFormShell({
  product,
  formId,
  onSubmit,
  submitting,
  after,
  children,
}: {
  /** The product being edited; null on a new one. */
  product: Product | null
  formId: string
  onSubmit: FormEventHandler<HTMLFormElement>
  submitting: boolean
  /** Shown under the form but outside it: sections that save on their own, like the variants table. */
  after?: ReactNode
  children: ReactNode
}) {
  const navigate = useNavigate()
  const backTo = product ? `/product_detail/${product.id}` : "/products"
  return (
    <div className="section-container">
      <PageHeader
        title={product ? "Edit product" : "Add product"}
        description={product ? `Editing ${product.name}` : undefined}
        back={{ to: backTo, label: "Back" }}
      />
      <form id={formId} onSubmit={onSubmit} className="space-y-6">
        {children}
      </form>
      {after && <div className="mt-6">{after}</div>}
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

export function BasicsCard({ categoryOptions }: { categoryOptions: CategoryOption[] }) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<BaseValues>()
  const brandOptions = useBrandOptions()
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
            <CategoryTreeCombobox
              control={control}
              name="category_id"
              id="category_id"
              options={categoryOptions}
              placeholder="Choose a category"
            />
            <FieldError errors={[errors.category_id]} />
          </FieldContent>
        </Field>

        <FormField label="Brand" htmlFor="brand_id">
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

        <TextareaField
          className="md:col-span-2"
          label="Product details"
          id="description"
          rows={8}
          error={errors.description}
          {...register("description")}
        />

        <TextareaField
          className="md:col-span-2"
          label="Highlights"
          id="highlights"
          rows={8}
          placeholder="One highlight per line"
          error={errors.highlights}
          {...register("highlights")}
        />

        <TextField
          className="md:col-span-2 xl:col-span-4"
          label="Meta keywords"
          id="meta_keywords"
          placeholder="comma, separated, keywords"
          error={errors.meta_keywords}
          {...register("meta_keywords")}
        />

        {/* The switches get a row of their own, each saying what it changes. */}
        <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2 md:col-span-2 xl:col-span-4 xl:grid-cols-4">
          {PRODUCT_SWITCHES.map(({ name, label, description }) => (
            <SwitchField key={name} control={control} name={name} label={label} description={description} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/** The Pricing card: the form's own money fields as children, then the SKU of a new product's first variant. */
export function PricingCard({
  isEditing,
  perVariant,
  simpleHint,
  children,
}: {
  isEditing: boolean
  /** A saved product with options: each variant has its own prices, so there is nothing to enter here. */
  perVariant: boolean
  /** Shown on a new product, where the price is required. */
  simpleHint: string
  children: ReactNode
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<BaseValues>()
  if (perVariant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>
            Each variant of this product has its own price. Change one, or set a price for all of them, under Variants
            on the product page.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing</CardTitle>
        <CardDescription>
          {isEditing ? "The price of this product." : simpleHint}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {children}
        {!isEditing && (
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
        options={product.options ?? []}
        variants={product.variants}
        canManage
        onChanged={() => dispatch(fetchSingle(product.id))}
      />
    </div>
  )
}

/** The variants of a saved product, on its edit form. Each change here saves at once, apart from the form. */
export function SavedVariants({ product }: { product: Product }) {
  const dispatch = useAppDispatch()
  return (
    <ProductVariantsSection
      key={savedOptionsOf(product)
        .map((o) => o.id)
        .join()}
      product={product}
      canManage
      onChanged={() => dispatch(fetchSingle(product.id))}
    />
  )
}
