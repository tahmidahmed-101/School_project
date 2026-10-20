import { useEffect, useMemo } from "react"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { PlusIcon, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { DetailPageState } from "@/components/common/DetailPageState"
import { PageHeader } from "@/components/common/PageHeader"
import { SwitchField } from "@/components/common/FormDialog"
import { FormActions } from "@/components/common/FormActions"
import { NoPermission } from "@/components/common/NoPermission"
import { TextField, TextareaField } from "@/components/common/form-fields"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { resolveDetailState } from "@/lib/detailState"
import { moneySchema, reportFormError } from "@/lib/forms"
import { formatCurrency } from "@/lib/format"

import { fetchSingle } from "../slices/bundleSlice"
import { PricingFields } from "./PricingFields"
import { createBundle, updateBundle } from "../api"
import type { Bundle, BundlePayload } from "../types"
import { uploadStagedImages, useStagedImages } from "../lib/stagedImages"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { CategoryTreeSelect } from "./CategoryTreeSelect"
import { ProductImagesSection } from "./ProductImagesSection"
import { StagedImagesCard } from "./StagedImagesCard"
import { VariantPicker, type PickedVariant } from "@/components/common/VariantPicker"

const STOCK_ONLY = { category_type: "stock" }

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category_id: z.string().min(1, "Choose a category"),
  sku: z.string().trim(),
  barcode: z.string().trim(),
  price: moneySchema,
  discount_price: moneySchema,
  cost_price: moneySchema,
  description: z.string(),
  is_active: z.boolean(),
  components: z
    .array(
      z.object({
        variant: z.custom<PickedVariant | null>().refine((v) => Boolean(v), "Choose a variant"),
        quantity: z.number({ error: "Enter a quantity" }).int().min(1, "At least 1"),
      })
    )
    .min(1, "Add at least one component"),
})
type FormValues = z.infer<typeof schema>

const BundleForm = () => {
  const { id } = useParams<{ id: string }>()
  const isEditing = Boolean(id && id !== "new")
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((s) => s.catalogBundles)
  const bundle = singleData as Bundle | null
  const { options: categoryOptions } = useCategoryOptions("stock")

  useDocumentTitle(isEditing ? (bundle?.name ? `Edit ${bundle.name}` : "Edit Bundle") : "New Bundle")

  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      category_id: "",
      sku: "",
      barcode: "",
      price: "",
      discount_price: "",
      cost_price: "",
      description: "",
      is_active: true,
      components: [{ variant: null, quantity: 1 }],
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: "components" })
  // Create only: images picked before the bundle exists, uploaded right after it is created.
  const staged = useStagedImages()
  const components = useWatch({ control, name: "components" })

  useEffect(() => {
    if (isEditing && id) dispatch(fetchSingle(id))
  }, [dispatch, id, isEditing])

  useEffect(() => {
    if (isEditing && bundle && bundle.id === id) {
      // The bundle is refetched whenever an image changes below; keepDirtyValues stops that
      // refetch from wiping edits the user has not saved yet.
      reset(
        {
          name: bundle.name,
          category_id: bundle.category_id ?? "",
          sku: bundle.sku,
          barcode: bundle.barcode ?? "",
          price: bundle.price ?? "",
          discount_price: bundle.discount_price ?? "",
          cost_price: bundle.cost_price ?? "",
          description: bundle.description ?? "",
          is_active: bundle.is_active,
          components: bundle.components.map((c) => ({
            variant: {
              id: c.component_variant_id,
              sku: c.component_sku,
              product_name: c.component_name,
              price: c.component_price,
              stock: c.component_available,
            },
            quantity: c.quantity,
          })),
        },
        { keepDirtyValues: true }
      )
    }
  }, [bundle, id, isEditing, reset])

  const componentTotal = useMemo(
    () =>
      (components ?? []).reduce(
        (sum, c) => sum + (c?.variant?.price ? Number(c.variant.price) * (Number(c.quantity) || 0) : 0),
        0
      ),
    [components]
  )

  if (!canManage) {
    return (
      <NoPermission message="You don't have permission to edit bundles." backTo="/bundles" backLabel="Back to bundles" />
    )
  }

  const pageState = isEditing ? resolveDetailState(singleStatus, singleError, bundle?.id === id) : null
  if (pageState) {
    return (
      <DetailPageState
        state={pageState}
        entity="Bundle"
        backTo="/bundles"
        backLabel="Back to Bundles"
        error={singleError}
        onRetry={() => id && dispatch(fetchSingle(id))}
      />
    )
  }

  const onSubmit = async (values: FormValues) => {
    const payload: BundlePayload = {
      name: values.name,
      category_id: values.category_id,
      barcode: values.barcode,
      description: values.description,
      is_active: values.is_active,
      price: values.price || null,
      cost_price: values.cost_price || null,
      discount_price: values.discount_price || null,
      components: values.components.map((c) => ({
        component_variant_id: (c.variant as PickedVariant).id,
        quantity: c.quantity,
      })),
    }
    if (values.sku) payload.sku = values.sku
    try {
      if (isEditing && id) {
        await updateBundle(id, payload)
        toast.success(`${values.name} updated`)
      } else {
        const created = await createBundle(payload)
        // The bundle now exists, so a failed image is reported and left to be retried from
        // the edit page rather than failing the whole form.
        const failed = await uploadStagedImages(created.product_id, staged.images)
        if (failed) toast.warning(`${values.name} created, but ${failed} image${failed === 1 ? "" : "s"} could not be added`)
        else toast.success(`${values.name} created`)
      }
      navigate("/bundles")
    } catch (err) {
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to save bundle" })
    }
  }

  const pickedIds = (components ?? []).map((c) => c?.variant?.id).filter(Boolean) as string[]

  return (
    <div className="section-container">
      <PageHeader
        title={isEditing ? "Edit Bundle" : "New Bundle"}
        description={isEditing ? `Editing ${bundle?.name ?? ""}` : undefined}
        back={{ to: "/bundles", label: "Back" }}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Bundle details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField label="Name" id="name" error={errors.name} {...register("name")} />
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
            <TextField
              label="SKU"
              id="sku"
              placeholder={isEditing ? undefined : "Auto-generated if blank"}
              error={errors.sku}
              {...register("sku")}
            />
            <TextField label="Barcode" id="barcode" error={errors.barcode} {...register("barcode")} />
            <TextareaField
              className="md:col-span-2"
              label="Description"
              id="description"
              rows={3}
              {...register("description")}
            />
            <SwitchField control={control} name="is_active" label="Status" onLabel="Active" offLabel="Inactive" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Components</CardTitle>
            <CardDescription>Bundle availability is limited by the scarcest component.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.map((f, index) => (
              <div key={f.id} className="grid grid-cols-[1fr_96px_auto] items-start gap-2">
                <div>
                  <Controller
                    control={control}
                    name={`components.${index}.variant`}
                    render={({ field }) => (
                      <VariantPicker
                        value={field.value ?? null}
                        onChange={field.onChange}
                        filters={STOCK_ONLY}
                        excludeIds={pickedIds}
                      />
                    )}
                  />
                  <FieldError errors={[errors.components?.[index]?.variant]} />
                </div>
                <div>
                  <Input
                    type="number"
                    min={1}
                    aria-label="Quantity"
                    {...register(`components.${index}.quantity`, { valueAsNumber: true })}
                  />
                  <FieldError errors={[errors.components?.[index]?.quantity]} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove component"
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
            <FieldError errors={[errors.components?.root ?? errors.components]} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => append({ variant: null, quantity: 1 })}>
                <PlusIcon /> Add component
              </Button>
              <span className="text-sm text-muted-foreground">
                Component total: <span className="font-medium text-foreground">{formatCurrency(componentTotal)}</span>
              </span>
            </div>
          </CardContent>
        </Card>

        {isEditing && bundle ? (
          // The gallery saves on its own; Enter in one of its inputs commits that field
          // instead of submitting the bundle form around it.
          <div
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
                e.preventDefault()
                e.target.blur()
              }
            }}
          >
            <ProductImagesSection
              productId={bundle.product_id}
              options={[]}
              variants={[]}
              canManage={canManage}
              onChanged={() => dispatch(fetchSingle(bundle.id))}
            />
          </div>
        ) : (
          <StagedImagesCard
            images={staged.images}
            onAdd={staged.add}
            onRemove={staged.remove}
            onMove={staged.move}
            description="Uploaded when the bundle is created. The first image is the main one."
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
            <CardDescription>Leave price or cost blank to default them to the component totals.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <PricingFields
              register={register}
              errors={errors}
              pricePlaceholder={componentTotal ? componentTotal.toFixed(2) : "0.00"}
              costPlaceholder="From components"
              costDescription="Defaults to the components' cost."
            />
          </CardContent>
        </Card>
        <FormActions
          sticky
          onCancel={() => navigate("/bundles")}
          submitLabel={isEditing ? "Save bundle" : "Create bundle"}
          submitting={isSubmitting}
        />
      </form>
    </div>
  )
}

export default BundleForm
