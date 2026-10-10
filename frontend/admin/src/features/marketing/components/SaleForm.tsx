import { useCallback, useEffect, useState } from "react"
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { PlusIcon, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { FieldDescription, FieldLabel } from "@/components/ui/field"
import { DetailPageState } from "@/components/common/DetailPageState"
import { PageHeader } from "@/components/common/PageHeader"
import { FormActions } from "@/components/common/FormActions"
import { DateField, FormField, SelectField, TextField } from "@/components/common/form-fields"

import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { ProductPickerDialog } from "@/features/catalog/components/ProductPickerDialog"
import { fetchSingle, patchData, postData } from "@/features/marketing/slices/saleSlice"
import type { NamedRef, Sale, SalePayload, SaleTarget } from "@/features/marketing/types"
import { useCan } from "@/hooks/use-can"
import type { ApiError } from "@/lib/api/client"
import { reportFormError } from "@/lib/forms"
import { resolveDetailState } from "@/lib/detailState"
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/format"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useStockBrandRows, useStockCategoryRows } from "../lib/stockTargets"
import { TickList } from "./TickList"

const PERCENT_MESSAGE = "Enter a percentage above 0 and below 100"

const saleSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name"),
    percent_off: z
      .string()
      .trim()
      .regex(/^\d{1,3}(\.\d{1,2})?$/, PERCENT_MESSAGE)
      .refine((value) => Number(value) > 0 && Number(value) < 100, PERCENT_MESSAGE),
    starts_at: z.string().min(1, "Choose when the sale starts"),
    ends_at: z.string(),
    is_active: z.boolean(),
    applies_to: z.enum(["all", "categories", "brands", "products"]),
    category_ids: z.array(z.string()),
    brand_ids: z.array(z.string()),
    products: z.array(z.object({ id: z.string(), name: z.string() })),
  })
  .superRefine((values, ctx) => {
    if (values.ends_at && values.starts_at && values.ends_at <= values.starts_at) {
      ctx.addIssue({ code: "custom", path: ["ends_at"], message: "The end must be after the start" })
    }
    const field = TARGET_FIELDS[values.applies_to]
    if (field && values[field].length === 0) {
      ctx.addIssue({ code: "custom", path: [field], message: `Choose at least one of the ${values.applies_to}` })
    }
  })

type SaleFormValues = z.infer<typeof saleSchema>

const TARGET_FIELDS: Record<SaleTarget, "category_ids" | "brand_ids" | "products" | null> = {
  all: null,
  categories: "category_ids",
  brands: "brand_ids",
  products: "products",
}

const TARGET_OPTIONS = [
  { label: "All stock", value: "all" },
  { label: "Chosen categories", value: "categories" },
  { label: "Chosen brands", value: "brands" },
  { label: "Chosen products", value: "products" },
]

const defaultValues: SaleFormValues = {
  name: "",
  percent_off: "",
  starts_at: "",
  ends_at: "",
  is_active: true,
  applies_to: "all",
  category_ids: [],
  brand_ids: [],
  products: [],
}

const FORM_FIELDS = Object.keys(defaultValues)
const API_FIELDS: Record<string, FieldPath<SaleFormValues>> = { product_ids: "products" }
const NO_REFS: NamedRef[] = []

const SaleForm = () => {
  const { id = "new" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("orders.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((state) => state.sales)
  const isEditing = id !== "new"
  const existing = isEditing && singleData?.id === id ? (singleData as Sale) : null
  const readOnly = !canManage

  useDocumentTitle(existing ? `${existing.name} — Sale` : isEditing ? "Sale" : "Add Sale")

  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SaleFormValues>({ resolver: zodResolver(saleSchema), defaultValues })
  const appliesTo = useWatch({ control, name: "applies_to" })

  const categories = useStockCategoryRows(existing?.categories ?? NO_REFS)
  const brands = useStockBrandRows(existing?.brands ?? NO_REFS)
  const [pickingProduct, setPickingProduct] = useState(false)

  const loadSale = useCallback(() => dispatch(fetchSingle(id)), [dispatch, id])

  useEffect(() => {
    if (!isEditing) return
    const request = loadSale()
    return () => request.abort()
  }, [isEditing, loadSale])

  const [syncedFor, setSyncedFor] = useState<Sale | null>(null)
  if (existing && existing !== syncedFor) {
    setSyncedFor(existing)
    reset({
      name: existing.name,
      percent_off: existing.percent_off,
      starts_at: toDatetimeLocal(existing.starts_at),
      ends_at: toDatetimeLocal(existing.ends_at),
      is_active: existing.is_active,
      applies_to: existing.applies_to,
      category_ids: existing.categories.map((c) => c.id).sort(),
      brand_ids: existing.brands.map((b) => b.id).sort(),
      products: existing.products.map(({ id, name }) => ({ id, name })),
    })
  }

  const pageState = isEditing ? resolveDetailState(singleStatus, singleError, !!existing) : null
  if (pageState) {
    return (
      <DetailPageState
        state={pageState}
        entity="Sale"
        backTo="/sales"
        backLabel="Back to Sales"
        error={singleError}
        onRetry={loadSale}
      />
    )
  }

  const onSubmit = async (values: SaleFormValues) => {
    const target = values.applies_to
    const payload: SalePayload = {
      name: values.name.trim(),
      percent_off: values.percent_off,
      starts_at: fromDatetimeLocal(values.starts_at),
      ends_at: fromDatetimeLocal(values.ends_at),
      is_active: values.is_active,
      applies_to: target,
      category_ids: target === "categories" ? values.category_ids : [],
      brand_ids: target === "brands" ? values.brand_ids : [],
      product_ids: target === "products" ? values.products.map((p) => p.id) : [],
    }

    try {
      if (existing) {
        await dispatch(patchData({ id: existing.id, payload: payload as Partial<Sale> })).unwrap()
        toast.success(`Sale ${payload.name} updated`)
      } else {
        await dispatch(postData({ payload: payload as Partial<Sale> })).unwrap()
        toast.success(`Sale ${payload.name} created`)
      }
      navigate("/sales")
    } catch (err) {
      const { code, message } = err as Partial<ApiError>
      const targetField = TARGET_FIELDS[target]
      if (code === "sale_target_required" && targetField && message) setError(targetField, { message })
      reportFormError(err, { setError, fields: FORM_FIELDS, fieldMap: API_FIELDS, fallback: "Couldn't save this sale" })
    }
  }

  const title = readOnly ? "Sale Details" : isEditing ? "Edit Sale" : "Add Sale"

  return (
    <div className="section-container space-y-6">
      <PageHeader title={title} back={{ to: "/sales", label: "Back to promotions" }} />

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Sale Details</CardTitle>
            <CardDescription>A sale takes a percentage off items in stock while it runs.</CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset disabled={readOnly} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField label="Name" id="name" error={errors.name} {...register("name")} />

              <TextField
                label="Percent off (%)"
                id="percent_off"
                inputMode="decimal"
                error={errors.percent_off}
                {...register("percent_off")}
              />

              <DateField label="Starts At" id="starts_at" withTime error={errors.starts_at} {...register("starts_at")} />

              <DateField
                label="Ends At"
                id="ends_at"
                withTime
                description="Leave empty to run until switched off"
                error={errors.ends_at}
                {...register("ends_at")}
              />

              <SelectField
                control={control}
                name="applies_to"
                label="Applies To"
                id="applies_to"
                disabled={readOnly}
                options={TARGET_OPTIONS}
              />

              {/* Beside "Applies To": the label with its switch on one line, the note under them. */}
              <div className="flex flex-col gap-1.5 md:self-end md:pb-0.5">
                <div className="flex items-center gap-3">
                  <FieldLabel htmlFor="is_active" className="w-auto">
                    On
                  </FieldLabel>
                  <Controller
                    control={control}
                    name="is_active"
                    render={({ field }) => (
                      <Switch id="is_active" checked={field.value} onCheckedChange={field.onChange} disabled={readOnly} />
                    )}
                  />
                </div>
                <FieldDescription>A sale that is switched off changes no prices.</FieldDescription>
              </div>

              {appliesTo === "categories" && (
                <Controller
                  control={control}
                  name="category_ids"
                  render={({ field }) => (
                    <FormField
                      label={`Categories${field.value.length ? ` (${field.value.length})` : ""}`}
                      error={errors.category_ids}
                      className="md:col-span-2"
                    >
                      <TickList
                        rows={categories.rows}
                        selected={field.value}
                        onChange={field.onChange}
                        disabled={readOnly}
                        isLoading={categories.isLoading}
                        noun="categories"
                      />
                    </FormField>
                  )}
                />
              )}

              {appliesTo === "brands" && (
                <Controller
                  control={control}
                  name="brand_ids"
                  render={({ field }) => (
                    <FormField
                      label={`Brands${field.value.length ? ` (${field.value.length})` : ""}`}
                      error={errors.brand_ids}
                      className="md:col-span-2"
                    >
                      <TickList
                        rows={brands.rows}
                        selected={field.value}
                        onChange={field.onChange}
                        disabled={readOnly}
                        isLoading={brands.isLoading}
                        noun="brands"
                      />
                    </FormField>
                  )}
                />
              )}

              {appliesTo === "products" && (
                <Controller
                  control={control}
                  name="products"
                  render={({ field }) => (
                    <FormField
                      label={`Products${field.value.length ? ` (${field.value.length})` : ""}`}
                      error={errors.products}
                      className="md:col-span-2"
                    >
                      <div className="flex flex-col items-start gap-2">
                        {field.value.length > 0 && (
                          <ul className="w-full divide-y divide-border rounded-lg border border-field-border">
                            {field.value.map((product) => (
                              <li key={product.id} className="flex items-center gap-3 px-3 py-1.5">
                                <span className="min-w-0 flex-1 truncate text-sm">{product.name}</span>
                                {!readOnly && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Remove ${product.name}`}
                                    onClick={() => field.onChange(field.value.filter((p) => p.id !== product.id))}
                                  >
                                    <Trash2 className="size-4 text-destructive" />
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {!readOnly && (
                          <Button type="button" variant="outline" onClick={() => setPickingProduct(true)}>
                            <PlusIcon className="size-4" /> Add product
                          </Button>
                        )}
                      </div>
                      <ProductPickerDialog
                        open={pickingProduct}
                        onOpenChange={setPickingProduct}
                        kind="stock"
                        title="Add a product to the sale"
                        onPick={(product) => {
                          if (!field.value.some((p) => p.id === product.id)) {
                            field.onChange([...field.value, { id: product.id, name: product.name }])
                          }
                          setPickingProduct(false)
                        }}
                      />
                    </FormField>
                  )}
                />
              )}
            </fieldset>
          </CardContent>
        </Card>
        {!readOnly && (
          <FormActions
            sticky
            onCancel={() => navigate("/sales")}
            submitLabel={isEditing ? "Save Changes" : "Create Sale"}
            submitting={isSubmitting}
            submitDisabled={isEditing && !isDirty}
          />
        )}
      </form>
    </div>
  )
}

export default SaleForm
