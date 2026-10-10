import { useEffect, useState, type FormEventHandler, type ReactNode } from "react"
import { Controller, useFieldArray, useFormContext } from "react-hook-form"
import { useNavigate } from "react-router-dom"
import { ChevronDown, ChevronUp, ListChecks, Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { PageHeader } from "@/components/common/PageHeader"
import { SwitchField } from "@/components/common/FormDialog"
import { FormActions } from "@/components/common/FormActions"
import { FormField, TextField, TextareaField } from "@/components/common/form-fields"
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
import { CategoryTreeCombobox } from "./CategoryTreeSelect"
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

        <TextField
          className="md:col-span-2"
          label="Meta keywords"
          id="meta_keywords"
          placeholder="comma, separated, keywords"
          error={errors.meta_keywords}
          {...register("meta_keywords")}
        />

        {/* The switches share one row, lined up with the keywords input. */}
        <div className="grid grid-cols-1 gap-4 self-end sm:grid-cols-2 md:col-span-2">
          <div className="py-2">
            <SwitchField control={control} name="featured" label="Featured" />
          </div>
          {isEditing && (
            <div className="py-2">
              <SwitchField
                control={control}
                name="is_active"
                label="Active"
                description="Inactive products are hidden from the storefront."
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** The Pricing card: the form's own money fields as children, then the SKU of a new product's first variant. */
export function PricingCard({
  isEditing,
  withOptions,
  perVariant,
  simpleHint,
  children,
}: {
  isEditing: boolean
  /** The options switch is on. */
  withOptions: boolean
  /** A saved product with options: each variant has its own prices, so there is nothing to enter here. */
  perVariant: boolean
  /** Shown on a new product without options, where the price is required. */
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
          {isEditing
            ? "The price of this product."
            : withOptions
              ? "Required. Every variant starts at this price; change single prices on the product page afterwards."
              : simpleHint}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {children}
        {!isEditing && !withOptions && (
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

/** Name + value rows shown on the storefront product page, in this order. */
export function SpecsCard() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<BaseValues>()
  const rows = useFieldArray({ control, name: "specs" })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="size-4" /> Specifications
        </CardTitle>
        <CardDescription>
          Facts about the product, like Material: Cotton. Customers see them in this order. Leave empty if there are
          none.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.fields.map((row, i) => (
          <div key={row.id} className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[1fr_1fr_auto] sm:gap-3">
            <Field>
              <FieldContent>
                <Input aria-label="Specification name" placeholder="Name, e.g. Material" {...register(`specs.${i}.name`)} />
                <FieldError errors={[errors.specs?.[i]?.name]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldContent>
                <Input aria-label="Specification value" placeholder="Value, e.g. Cotton" {...register(`specs.${i}.value`)} />
                <FieldError errors={[errors.specs?.[i]?.value]} />
              </FieldContent>
            </Field>
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => rows.move(i, i - 1)}
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Move down"
                disabled={i === rows.fields.length - 1}
                onClick={() => rows.move(i, i + 1)}
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove row" onClick={() => rows.remove(i)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => rows.append({ name: "", value: "" })}>
          <Plus className="size-4" /> Add a row
        </Button>
      </CardContent>
    </Card>
  )
}
