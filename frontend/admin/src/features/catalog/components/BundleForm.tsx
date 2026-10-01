import { useEffect, useMemo } from "react"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, Loader2, PlusIcon, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { DetailPageState } from "@/components/common/DetailPageState"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { resolveDetailState } from "@/lib/detailState"
import { formatCurrency } from "@/lib/format"

import { fetchSingle } from "../slices/bundleSlice"
import { createBundle, updateBundle } from "../api"
import type { Bundle, BundlePayload } from "../types"
import { useCategoryOptions } from "../lib/useCategoryOptions"
import { usePermission } from "../lib/usePermission"
import { VariantPicker, type PickedVariant } from "./VariantPicker"

const money = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) >= 0), "Enter a valid amount")

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category_id: z.string().min(1, "Choose a category"),
  sku: z.string().trim(),
  barcode: z.string().trim(),
  price: money,
  discount_price: money,
  cost_price: money,
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
  const canManage = usePermission("catalog.manage")
  const { singleData, singleStatus, singleError } = useAppSelector((s) => s.catalogBundles)
  const bundle = singleData as Bundle | null
  const { options: categoryOptions } = useCategoryOptions()

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
  const components = useWatch({ control, name: "components" })

  useEffect(() => {
    if (isEditing && id) dispatch(fetchSingle(id))
  }, [dispatch, id, isEditing])

  useEffect(() => {
    if (isEditing && bundle && bundle.id === id) {
      reset({
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
      })
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
      <div className="section-container py-16 text-center text-sm text-muted-foreground">
        You don't have permission to edit bundles.{" "}
        <Link className="text-primary underline" to="/bundles">
          Back to bundles
        </Link>
      </div>
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
        await createBundle(payload)
        toast.success(`${values.name} created`)
      }
      navigate("/bundles")
    } catch (err) {
      for (const [field, message] of Object.entries(getApiFieldErrors(err))) {
        if (field in values) setError(field as keyof FormValues, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to save bundle"))
    }
  }

  const pickedIds = (components ?? []).map((c) => c?.variant?.id).filter(Boolean) as string[]

  return (
    <div className="section-container">
      <div className="flex items-center gap-4">
        <Button variant="back" size="icon" aria-label="Back" onClick={() => navigate("/bundles")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{isEditing ? "Edit Bundle" : "New Bundle"}</h1>
          <p className="text-muted-foreground text-sm">
            {isEditing ? `Editing ${bundle?.name ?? ""}` : "Combine existing variants into one sellable SKU"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Bundle details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <FieldContent>
                <Input id="name" {...register("name")} />
                <FieldError errors={[errors.name]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="category_id">Category</FieldLabel>
              <FieldContent>
                <Controller
                  control={control}
                  name="category_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="category_id" className="w-full">
                        <SelectValue placeholder="Choose a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {"  ".repeat(o.depth)}
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.category_id]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="sku">SKU</FieldLabel>
              <FieldContent>
                <Input id="sku" placeholder={isEditing ? undefined : "Auto-generated if blank"} {...register("sku")} />
                <FieldError errors={[errors.sku]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="barcode">Barcode</FieldLabel>
              <FieldContent>
                <Input id="barcode" {...register("barcode")} />
                <FieldError errors={[errors.barcode]} />
              </FieldContent>
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <FieldContent>
                <Textarea id="description" rows={3} {...register("description")} />
              </FieldContent>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="is_active">Active</FieldLabel>
              </FieldContent>
              <Controller
                control={control}
                name="is_active"
                render={({ field }) => <Switch id="is_active" checked={field.value} onCheckedChange={field.onChange} />}
              />
            </Field>
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

        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
            <CardDescription>Leave price or cost blank to default them to the component totals.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="price">Price (BDT)</FieldLabel>
              <FieldContent>
                <Input id="price" inputMode="decimal" placeholder={componentTotal ? componentTotal.toFixed(2) : "0.00"} {...register("price")} />
                <FieldError errors={[errors.price]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="discount_price">Discount price</FieldLabel>
              <FieldContent>
                <Input id="discount_price" inputMode="decimal" placeholder="Optional" {...register("discount_price")} />
                <FieldError errors={[errors.discount_price]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="cost_price">Cost price</FieldLabel>
              <FieldContent>
                <Input id="cost_price" inputMode="decimal" placeholder="From components" {...register("cost_price")} />
                <FieldDescription>Defaults to the components' cost.</FieldDescription>
                <FieldError errors={[errors.cost_price]} />
              </FieldContent>
            </Field>
          </CardContent>
          <CardFooter className="justify-end gap-3 border-t p-4">
            <Button type="button" variant="outline" onClick={() => navigate("/bundles")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isEditing ? "Save bundle" : "Create bundle"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}

export default BundleForm
